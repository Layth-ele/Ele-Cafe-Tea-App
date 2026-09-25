import type { Meta, StoryObj } from '@storybook/react';
import { Search, Mail, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Input } from './input';

/**
 * Single-line text input. Inherits all native `<input>` props plus
 * Tailwind classes for the consistent visual baseline.
 *
 * What's wired in:
 *   - `bg-input-background` — flips with theme.
 *   - `border-input` — same.
 *   - `focus-visible:ring` — uses the `--focus-color` token.
 *   - `aria-invalid:border-destructive` — styling driven by ARIA, not
 *     a separate `error` prop. Set `aria-invalid` on the field when
 *     validation fails; the visual state follows.
 *
 * Accessibility:
 *   - Always pair with a `<label htmlFor>` or wrap in `<label>`. The
 *     Phase 0.5 static a11y scan flags inputs missing this.
 *   - Use `aria-describedby` to link a hint or error message.
 *   - Use `autoComplete` (one of the well-known tokens — `email`,
 *     `current-password`, `street-address`, etc.) on every input. It's
 *     the highest-leverage UX win in form-land.
 */
const meta = {
  title:     'UI Primitives/Input',
  component: Input,
  argTypes:  {
    type:        { control: 'select', options: ['text', 'email', 'password', 'tel', 'url', 'search', 'number'] },
    placeholder: { control: 'text' },
    disabled:    { control: 'boolean' },
    'aria-invalid': { control: 'boolean' },
  },
  args: {
    placeholder: 'Type here…',
    type:        'text',
    disabled:    false,
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/* The labelled pattern — production code should always use this, not
 * a bare Input. The `htmlFor` / `id` association is mandatory for axe
 * to pass. */
export const WithLabel: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 320 }}>
      <label htmlFor="email-field" style={{ fontSize: 14, fontWeight: 500 }}>
        Email
      </label>
      <Input id="email-field" type="email" autoComplete="email" placeholder="you@example.com" />
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
        We use this for order updates only.
      </span>
    </div>
  ),
};

/* Error state — flagged via `aria-invalid="true"`. The validation
 * message is linked via `aria-describedby`, and uses `role="alert"`
 * so screen readers announce it the moment it appears. */
export const ErrorState: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 320 }}>
      <label htmlFor="email-err" style={{ fontSize: 14, fontWeight: 500 }}>
        Email
      </label>
      <Input
        id="email-err"
        type="email"
        defaultValue="not-an-email"
        aria-invalid="true"
        aria-describedby="email-err-msg"
      />
      <span
        id="email-err-msg"
        role="alert"
        style={{ fontSize: 12, color: 'var(--state-danger-fg)' }}
      >
        Enter a valid email address.
      </span>
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'Read-only value' },
};

/* Search field with leading icon. The icon sits in a relative wrapper;
 * the Input gets left-padding equal to the icon column width so text
 * doesn't render under the glyph. */
export const SearchWithIcon: Story = {
  render: () => (
    <div style={{ position: 'relative', width: 320 }}>
      <Search
        size={16}
        style={{
          position: 'absolute',
          left: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--muted)',
          pointerEvents: 'none',
        }}
      />
      <Input
        type="search"
        placeholder="Search teas…"
        style={{ paddingLeft: 36 }}
        aria-label="Search teas"
      />
    </div>
  ),
};

/* Password field with show/hide toggle. The toggle button has an
 * `aria-pressed` attribute that flips with the visibility state — SR
 * users hear "Show password, toggle button, not pressed" / "pressed". */
export const PasswordWithToggle: Story = {
  render: () => {
    /* eslint-disable-next-line react-hooks/rules-of-hooks */
    const [show, setShow] = useState(false);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 320 }}>
        <label htmlFor="pw-field" style={{ fontSize: 14, fontWeight: 500 }}>
          Password
        </label>
        <div style={{ position: 'relative' }}>
          <Input
            id="pw-field"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            style={{ paddingRight: 40 }}
          />
          <button
            type="button"
            aria-label={show ? 'Hide password' : 'Show password'}
            aria-pressed={show}
            onClick={() => setShow(s => !s)}
            style={{
              position: 'absolute',
              right: 4,
              top: '50%',
              transform: 'translateY(-50%)',
              padding: 8,
              border: 0,
              background: 'transparent',
              color: 'var(--muted)',
              cursor: 'pointer',
            }}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
    );
  },
};

/* Email with prefix icon — same icon-padding pattern as search. */
export const EmailWithIcon: Story = {
  render: () => (
    <div style={{ position: 'relative', width: 320 }}>
      <Mail
        size={16}
        style={{
          position: 'absolute',
          left: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--muted)',
          pointerEvents: 'none',
        }}
      />
      <Input
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        style={{ paddingLeft: 36 }}
        aria-label="Email"
      />
    </div>
  ),
};
