export default function NodeBadges({ data }) {
  const biCount = data?.biMarkings?.length ?? 0;
  const canNavigate = Boolean(data?.isNavigableDestination && data?.navigateToState);
  if (biCount === 0 && !canNavigate) return null;

  return (
    <div className="node-badges">
      {biCount > 0 && <span className="bi-node-badge">{biCount === 1 ? '1 B.I.' : `${biCount} B.I.`}</span>}
      {canNavigate && <span className="navigate-node-badge">Abrir estado</span>}
    </div>
  );
}
