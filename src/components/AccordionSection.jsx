import { ChevronDown } from 'lucide-react';

export default function AccordionSection({
  title,
  badge,
  isOpen,
  onToggle,
  children,
  collapsedContent = null,
  className = '',
  icon = null,
}) {
  return (
    <section className={`panel-section accordion-section ${className} ${isOpen ? 'is-open' : 'is-collapsed'}`}>
      <button className="accordion-header" type="button" onClick={onToggle} aria-expanded={isOpen}>
        <span className="accordion-title">
          <h2>{title}</h2>
          {badge !== undefined && badge !== null && <em>{badge}</em>}
        </span>
        <span className="accordion-actions">
          {icon}
          <ChevronDown size={16} />
        </span>
      </button>

      {isOpen ? (
        <div className="accordion-content">{children}</div>
      ) : (
        collapsedContent && <div className="accordion-collapsed-content">{collapsedContent}</div>
      )}
    </section>
  );
}
