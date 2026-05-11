export default function NodeBadges({ data }) {
  const biCount = data?.biMarkings?.length ?? 0;
  if (biCount === 0) return null;

  return (
    <div className="node-badges">
      <span className="bi-node-badge">{biCount === 1 ? '1 B.I.' : `${biCount} B.I.`}</span>
    </div>
  );
}
