export default function VideoEmbed({ videoId }) {
  if (!videoId) return null;

  return (
    <div style={{ position: "relative", paddingTop: "56.25%", margin: "12px 0", borderRadius: 8, overflow: "hidden" }}>
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title="Topic video"
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}