import { useEffect, useRef, useState } from 'react';
import { suggestAddresses } from '../lib/photon';

const EXAMPLES = ['1600 Pennsylvania Ave NW, Washington, DC', 'Austin, TX', 'Golden Gate Park, San Francisco', 'Key Largo, FL'];
const DEBOUNCE_MS = 250;
const MIN_CHARS = 3;

export default function SearchForm({ initialValue, busy, onSearch }) {
  const [value, setValue] = useState(initialValue || '');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // The most recently submitted text; typing that exact value again should not reopen suggestions.
  const lastSubmitted = useRef(initialValue || '');
  const abortRef = useRef(null);
  const listId = 'address-suggestions';

  useEffect(() => {
    const q = value.trim();
    if (q === lastSubmitted.current.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (q.length < MIN_CHARS) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const results = await suggestAddresses(q, controller.signal);
        if (controller.signal.aborted) return;
        setSuggestions(results);
        setOpen(results.length > 0);
        setActive(-1);
      } catch (err) {
        if (err.name !== 'AbortError') setSuggestions([]);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);

  function choose(s) {
    abortRef.current?.abort();
    lastSubmitted.current = s.label;
    setValue(s.label);
    setSuggestions([]);
    setOpen(false);
    setActive(-1);
    onSearch({ label: s.label, lat: s.lat, lng: s.lng, source: 'photon' });
  }

  function submitText(text) {
    abortRef.current?.abort();
    lastSubmitted.current = text;
    setValue(text);
    setSuggestions([]);
    setOpen(false);
    setActive(-1);
    onSearch(text);
  }

  function submit(e) {
    e.preventDefault();
    if (open && active >= 0 && suggestions[active]) return choose(suggestions[active]);
    if (value.trim().length >= MIN_CHARS) submitText(value.trim());
  }

  function onKeyDown(e) {
    if (!open || !suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <form onSubmit={submit} className="w-full">
      <label htmlFor="address" className="mb-2 block text-sm font-medium text-moss-100">
        Enter a US address, city, ZIP code, or landmark
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <input
            id="address"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => suggestions.length && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            placeholder="e.g. 123 Main St, Boulder, CO"
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            className="w-full rounded-lg border border-moss-300/40 bg-white px-4 py-3 text-base text-stone-900 shadow-sm placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-moss-300"
          />
          {open ? (
            <ul
              id={listId}
              role="listbox"
              className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-stone-200 bg-white text-stone-800 shadow-lg"
            >
              {suggestions.map((s, i) => (
                <li
                  key={s.label}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(s);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`cursor-pointer px-4 py-2.5 text-sm ${i === active ? 'bg-moss-50 text-moss-800' : ''}`}
                >
                  <span className="mr-2 text-stone-400" aria-hidden="true">
                    📍
                  </span>
                  {s.label}
                </li>
              ))}
              <li className="border-t border-stone-100 px-4 py-1.5 text-[10px] text-stone-400">
                Suggestions by Photon / OpenStreetMap
              </li>
            </ul>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={busy || value.trim().length < MIN_CHARS}
          className="rounded-lg bg-moss-500 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-moss-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Searching…' : 'Find wildlife'}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-moss-100/80">
        <span>Try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => submitText(ex)}
            className="rounded-full border border-moss-300/40 px-2.5 py-1 hover:bg-moss-700/60"
          >
            {ex}
          </button>
        ))}
      </div>
    </form>
  );
}
