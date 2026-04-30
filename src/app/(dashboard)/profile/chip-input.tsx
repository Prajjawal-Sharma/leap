"use client";

import { useState, type KeyboardEvent } from "react";

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  maxItems?: number;
  ariaLabel?: string;
  id?: string;
};

export function ChipInput({
  value,
  onChange,
  placeholder,
  maxItems = 10,
  ariaLabel,
  id,
}: Props) {
  const [draft, setDraft] = useState("");

  const tryAdd = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (value.length >= maxItems) return;
    if (value.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, trimmed]);
    setDraft("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      tryAdd(draft);
      return;
    }
    if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const atCap = value.length >= maxItems;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-black/40 ring-1 ring-white/10 focus-within:ring-[#6366f1] px-2 py-2">
      {value.map((chip, i) => (
        <span
          key={`${chip}-${i}`}
          className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-xs text-neutral-100"
        >
          <span>{chip}</span>
          <button
            type="button"
            aria-label={`Remove ${chip}`}
            onClick={() => remove(i)}
            className="text-neutral-400 hover:text-white leading-none"
          >
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : atCap ? `Max ${maxItems}` : ""}
        aria-label={ariaLabel}
        disabled={atCap}
        className="flex-1 min-w-[140px] bg-transparent outline-none text-sm placeholder:text-neutral-500 disabled:cursor-not-allowed"
      />
    </div>
  );
}
