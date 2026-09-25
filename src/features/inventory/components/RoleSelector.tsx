/**
 * RoleSelector.tsx — Inline card-style radio group for picking an
 * employee role.
 *
 * Each option renders as a full-width card with a visible indicator
 * on the left and the label + description on the right. Clicking
 * anywhere on the card selects it. The selected card gets a gold
 * border + tinted background and a checkmark inside the indicator —
 * so admins can see at a glance which mode is active.
 */

import { useId } from 'react';
import { Check } from 'lucide-react';
import type { EmployeeRole } from '@/features/inventory/schemas/inventory.schema';

interface RoleSelectorProps {
  value:    EmployeeRole;
  onChange: (next: EmployeeRole) => void;
  disabled?: boolean;
}

const OPTIONS: Array<{
  value: EmployeeRole;
  label: string;
  desc:  string;
}> = [
  {
    value: 'edit',
    label: 'Edit',
    desc:  'Can change tea levels and item quantities.',
  },
  {
    value: 'readonly',
    label: 'Read-only',
    desc:  'Can view the dashboard but not change anything.',
  },
];

export function RoleSelector({ value, onChange, disabled }: RoleSelectorProps) {
  const groupId = useId();
  return (
    <fieldset className="rsel">
      <legend className="rsel-legend">
        Role <span className="rsel-hint">Choose what this person can do</span>
      </legend>
      <div className="rsel-options" role="radiogroup" aria-labelledby={groupId}>
        {OPTIONS.map((opt) => {
          const checked = value === opt.value;
          return (
            <label key={opt.value} className="rsel-option" data-checked={checked || undefined}>
              <input
                type="radio"
                name={`role-${groupId}`}
                value={opt.value}
                checked={checked}
                onChange={() => onChange(opt.value)}
                disabled={disabled}
                className="rsel-option-radio"
              />
              <span className="rsel-option-indicator" aria-hidden="true">
                {checked && <Check size={14} strokeWidth={3} />}
              </span>
              <span className="rsel-option-body">
                <span className="rsel-option-label">{opt.label}</span>
                <span className="rsel-option-desc">{opt.desc}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
