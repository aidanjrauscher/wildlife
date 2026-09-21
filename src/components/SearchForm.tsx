import { useState, type FormEvent } from 'react';

const EXAMPLES = ['Austin, TX', 'Portland, OR', 'Miami, FL', 'Boulder, CO', '1600 Pennsylvania Ave NW, Washington, DC'];

interface Props {
  initial: string;
  busy: boolean;
  onSearch: (query: string) => void;
}

export function SearchForm({ initial, busy, onSearch }: Props) {
  const [value, setValue] = useState(initial);

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (q.length >= 3) onSearch(q);
  }

  return (
    <form className="search" onSubmit={submit} role="search">
      <label className="search__label" htmlFor="address">
        Enter a US address, city, or ZIP code
      </label>
      <div className="search__row">
        <input
          id="address"
          className="search__input"
          type="text"
          autoComplete="street-address"
          placeholder="e.g. 123 Main St, Springfield, IL or 97201"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
        />
        <button className="btn btn--primary" type="submit" disabled={busy || value.trim().length < 3}>
          {busy ? 'Searching…' : 'Find wildlife'}
        </button>
      </div>
      <div className="search__examples">
        <span>Try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            className="chip chip--link"
            disabled={busy}
            onClick={() => {
              setValue(ex);
              onSearch(ex);
            }}
          >
            {ex}
          </button>
        ))}
      </div>
    </form>
  );
}
