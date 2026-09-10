-- ============================================================
-- 06: Course forums (questions, replies, ratings)
-- ============================================================

create table if not exists public.forum_questions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  avg_rating numeric not null default 0,
  rating_count int not null default 0,
  exp_awarded numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.forum_questions enable row level security;

create policy "entitled can view questions" on public.forum_questions
  for select using (public.is_entitled_to_course(course_id));

create policy "entitled can post questions" on public.forum_questions
  for insert with check (author_id = auth.uid() and public.is_entitled_to_course(course_id) and public.is_active_user());

create policy "author or moderator can delete questions" on public.forum_questions
  for delete using (
    author_id = auth.uid()
    or exists (select 1 from public.courses c where c.id = course_id and c.tutor_id = auth.uid())
    or public.current_user_role() in ('admin', 'super_admin')
  );

create table if not exists public.forum_replies (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.forum_questions(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  avg_rating numeric not null default 0,
  rating_count int not null default 0,
  exp_awarded numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.forum_replies enable row level security;

create policy "entitled can view replies" on public.forum_replies
  for select using (public.is_entitled_to_course(course_id));

create policy "entitled can post replies" on public.forum_replies
  for insert with check (author_id = auth.uid() and public.is_entitled_to_course(course_id) and public.is_active_user());

create policy "author or moderator can delete replies" on public.forum_replies
  for delete using (
    author_id = auth.uid()
    or exists (select 1 from public.courses c where c.id = course_id and c.tutor_id = auth.uid())
    or public.current_user_role() in ('admin', 'super_admin')
  );

create table if not exists public.forum_ratings (
  id uuid primary key default gen_random_uuid(),
  rater_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('question', 'reply', 'topic')),
  target_id uuid not null,
  stars int not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  unique (rater_id, target_type, target_id)
);

alter table public.forum_ratings enable row level security;

create policy "view own ratings" on public.forum_ratings
  for select using (auth.uid() = rater_id or public.current_user_role() in ('admin', 'super_admin'));
-- No insert policy — all writes go through submit_rating() below.

-- +5 EXP for posting a reply (students and tutors both), logged to exp_ledger.
create or replace function public.award_reply_post_exp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where id = new.author_id;

  if v_role = 'student' then
    insert into public.student_stats (student_id, total_exp, period_exp)
    values (new.author_id, 5, 5)
    on conflict (student_id) do update
      set total_exp = student_stats.total_exp + 5,
          period_exp = student_stats.period_exp + 5;
    insert into public.exp_ledger (profile_id, amount, source) values (new.author_id, 5, 'forum_post');
  elsif v_role = 'tutor' then
    insert into public.tutor_stats (tutor_id, total_exp, period_exp)
    values (new.author_id, 5, 5)
    on conflict (tutor_id) do update
      set total_exp = tutor_stats.total_exp + 5,
          period_exp = tutor_stats.period_exp + 5;
    insert into public.exp_ledger (profile_id, amount, source) values (new.author_id, 5, 'forum_post');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_award_reply_post_exp on public.forum_replies;
create trigger trg_award_reply_post_exp
  after insert on public.forum_replies
  for each row execute function public.award_reply_post_exp();

-- Single rating entry point for questions, replies, and topic content.
-- Enforces: no self-rating, one rating per person per target, entitlement,
-- and applies the correct EXP scale per target type. Never lets the client
-- touch EXP math directly.
create or replace function public.submit_rating(p_target_type text, p_target_id uuid, p_stars int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rater uuid := auth.uid();
  v_author uuid;
  v_course_id uuid;
  v_author_role text;
  v_delta numeric := 0;
  v_already boolean;
  v_ledger_source text;
begin
  if v_rater is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_active_user() then
    raise exception 'Your account is suspended.';
  end if;

  if p_stars < 1 or p_stars > 5 then
    raise exception 'Invalid rating';
  end if;
  if p_target_type not in ('question', 'reply', 'topic') then
    raise exception 'Invalid target type';
  end if;

  if p_target_type = 'question' then
    select author_id, course_id into v_author, v_course_id from public.forum_questions where id = p_target_id;
    v_ledger_source := 'rating_question';
  elsif p_target_type = 'reply' then
    select author_id, course_id into v_author, v_course_id from public.forum_replies where id = p_target_id;
    v_ledger_source := 'rating_reply';
  else
    select c.tutor_id, t.course_id into v_author, v_course_id
    from public.topics t join public.courses c on c.id = t.course_id
    where t.id = p_target_id;
    v_ledger_source := 'rating_topic';
  end if;

  if v_author is null then
    raise exception 'Target not found';
  end if;
  if v_author = v_rater then
    raise exception 'You cannot rate your own post';
  end if;
  if not public.is_entitled_to_course(v_course_id) then
    raise exception 'Not entitled to this course';
  end if;

  select exists (
    select 1 from public.forum_ratings
    where rater_id = v_rater and target_type = p_target_type and target_id = p_target_id
  ) into v_already;

  if v_already then
    raise exception 'You already rated this';
  end if;

  insert into public.forum_ratings (rater_id, target_type, target_id, stars)
  values (v_rater, p_target_type, p_target_id, p_stars);

  -- Reply: 1★:-10, 2★:0, 3★:+5, 4★:+10, 5★:+15
  -- Question: only 4★/5★ ever change EXP (+10 / +15)
  -- Topic content: every tier counts, 1★:-10, 2★:-5, 3★:+5, 4★:+10, 5★:+15
  if p_target_type = 'reply' then
    update public.forum_replies
      set rating_count = rating_count + 1,
          avg_rating = round(((avg_rating * rating_count) + p_stars)::numeric / (rating_count + 1), 2)
      where id = p_target_id;
    v_delta := case p_stars when 1 then -10 when 2 then 0 when 3 then 5 when 4 then 10 when 5 then 15 else 0 end;
  elsif p_target_type = 'question' then
    update public.forum_questions
      set rating_count = rating_count + 1,
          avg_rating = round(((avg_rating * rating_count) + p_stars)::numeric / (rating_count + 1), 2)
      where id = p_target_id;
    v_delta := case p_stars when 4 then 10 when 5 then 15 else 0 end;
  else
    update public.topics
      set rating_count = rating_count + 1,
          avg_rating = round(((avg_rating * rating_count) + p_stars)::numeric / (rating_count + 1), 2)
      where id = p_target_id;
    v_delta := case p_stars when 1 then -10 when 2 then -5 when 3 then 5 when 4 then 10 when 5 then 15 else 0 end;
  end if;

  select role into v_author_role from public.profiles where id = v_author;

  if v_delta <> 0 then
    if v_author_role = 'student' then
      insert into public.student_stats (student_id, total_exp, period_exp)
      values (v_author, greatest(v_delta, 0), greatest(v_delta, 0))
      on conflict (student_id) do update
        set total_exp = greatest(student_stats.total_exp + v_delta, 0),
            period_exp = greatest(student_stats.period_exp + v_delta, 0);
    elsif v_author_role = 'tutor' then
      insert into public.tutor_stats (tutor_id, total_exp, period_exp)
      values (v_author, greatest(v_delta, 0), greatest(v_delta, 0))
      on conflict (tutor_id) do update
        set total_exp = greatest(tutor_stats.total_exp + v_delta, 0),
            period_exp = greatest(tutor_stats.period_exp + v_delta, 0);
    end if;

    if p_target_type = 'reply' then
      update public.forum_replies set exp_awarded = exp_awarded + v_delta where id = p_target_id;
    elsif p_target_type = 'question' then
      update public.forum_questions set exp_awarded = exp_awarded + v_delta where id = p_target_id;
    else
      update public.topics set exp_awarded = exp_awarded + v_delta where id = p_target_id;
    end if;

    insert into public.exp_ledger (profile_id, amount, source) values (v_author, v_delta, v_ledger_source);
  end if;
end;
$$;

grant execute on function public.submit_rating(text, uuid, int) to authenticated;
