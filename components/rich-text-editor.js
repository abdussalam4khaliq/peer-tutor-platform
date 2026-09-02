"use client";

import { forwardRef, useImperativeHandle } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";

const RichTextEditor = forwardRef(function RichTextEditor(
  { initialContent = "", placeholder = "Write here...", onUpdate },
  ref
) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: initialContent,
    editorProps: {
      attributes: { class: "prose rte__content" },
    },
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onUpdate?.(editor.getText());
    },
  });

  useImperativeHandle(ref, () => ({
    getHTML: () => editor?.getHTML() || "",
    getText: () => editor?.getText() || "",
    clear: () => editor?.commands.clearContent(true),
    isEmpty: () => editor?.isEmpty ?? true,
  }));

  if (!editor) return null;

  function setLink() {
    const url = window.prompt("URL:");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: url }).run();
  }

  return (
    <div className="rte">
      <div className="rte__toolbar">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} data-active={editor.isActive("bold")}>B</button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} data-active={editor.isActive("italic")}><em>i</em></button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} data-active={editor.isActive("heading", { level: 2 })}>H2</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} data-active={editor.isActive("heading", { level: 3 })}>H3</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} data-active={editor.isActive("bulletList")}>• List</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} data-active={editor.isActive("orderedList")}>1. List</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} data-active={editor.isActive("blockquote")}>&quot;</button>
        <button type="button" onClick={() => editor.chain().focus().toggleCodeBlock().run()} data-active={editor.isActive("codeBlock")}>{"</>"}</button>
        <button type="button" onClick={setLink} data-active={editor.isActive("link")}>Link</button>
        <button type="button" onClick={() => editor.chain().focus().undo().run()}>Undo</button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()}>Redo</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
});

export default RichTextEditor;