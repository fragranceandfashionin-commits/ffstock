import { useState, useEffect, useRef } from 'react';
import { Search, X, Maximize2, Camera } from 'lucide-react';
import { COMMON_COLORS, COMMON_PRINTING_DESIGNS } from '../../lib/constants';
import { inputClass, colorToCss } from './styles';
import { Modal } from './Modal';

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  debounceMs = 150,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  debounceMs?: number;
}) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    if (localValue === value) return;
    const timer = setTimeout(() => {
      onChange(localValue);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [localValue, value, onChange, debounceMs]);

  return (
    <div className="relative flex-1 max-w-sm">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        type="text"
        className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-8 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
      />
      {localValue && (
        <button
          type="button"
          onClick={() => {
            setLocalValue('');
            onChange('');
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
          title="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function Dropzone({
  previewUrl,
  onFileSelect,
  onClear,
}: {
  previewUrl: string;
  onFileSelect: (file: File | null) => void;
  onClear: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0] ?? null;
          onFileSelect(selected);
        }}
      />

      {previewUrl ? (
        <div className="relative inline-block group rounded-2xl border border-slate-200 p-1.5 bg-slate-50">
          <img
            src={previewUrl}
            alt="Batch preview"
            className="h-28 w-28 rounded-xl object-cover border border-slate-200 shadow-sm"
          />
          <div className="absolute inset-0 bg-slate-900/40 rounded-xl opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-xl bg-white/95 min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-800 hover:bg-white shadow-xs transition cursor-pointer"
              title="Expand photo"
              aria-label="Expand photo"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClear}
              className="rounded-xl bg-rose-600 min-w-[36px] min-h-[36px] flex items-center justify-center text-white hover:bg-rose-700 shadow-xs transition cursor-pointer"
              title="Remove photo"
              aria-label="Remove photo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center w-full rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-4 text-center hover:bg-slate-100/80 transition cursor-pointer group"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm group-hover:text-slate-800 transition">
            <Camera className="h-5 w-5" />
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-700">Click to upload shipment / item photo</p>
          <p className="mt-0.5 text-[11px] text-slate-500">JPG, PNG up to 10 MB (optional)</p>
        </button>
      )}

      {modalOpen && previewUrl && (
        <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Shipment Photo Preview">
          <div className="flex justify-center p-2">
            <img src={previewUrl} alt="Shipment photo enlarged preview" className="max-h-[70vh] rounded-xl object-contain" />
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Select dropdown with predefined suggestions + customizable "Custom" option */
export function ColorSelect({
  value,
  onChange,
  colors = COMMON_COLORS,
  placeholder = 'Select Color / Finish…',
  customPlaceholder = 'Type custom color (e.g. Metallic Rose, Gradient Blue)…',
  className = '',
  size = 'md',
  disabled = false,
}: {
  value: string;
  onChange: (val: string) => void;
  colors?: readonly string[];
  placeholder?: string;
  customPlaceholder?: string;
  className?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
}) {
  const [isCustomMode, setIsCustomMode] = useState(false);
  const isPredefined = colors.some((c) => c.toLowerCase().trim() === value.toLowerCase().trim());
  const showCustomInput = isCustomMode || (!isPredefined && Boolean(value && value.trim()));

  const matchedColor = colors.find((c) => c.toLowerCase().trim() === value.toLowerCase().trim()) || '';
  const selectValue = showCustomInput ? '__custom__' : matchedColor;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <select
        className={`${inputClass} ${size === 'sm' ? 'text-xs py-1.5 px-2.5 font-bold' : 'text-sm font-semibold'} ${
          showCustomInput ? 'border-sky-400 bg-sky-50/20' : ''
        }`}
        value={selectValue}
        disabled={disabled}
        onChange={(e) => {
          const val = e.target.value;
          if (val === '__custom__') {
            setIsCustomMode(true);
            if (isPredefined) {
              onChange('');
            }
          } else {
            setIsCustomMode(false);
            onChange(val);
          }
        }}
      >
        <option value="">{placeholder}</option>
        <optgroup label="Standard Bottle Coating & Glass Finishes">
          {colors.map((c) => (
            <option key={c} value={c}>
              🎨 {c}
            </option>
          ))}
        </optgroup>
        <option value="__custom__">⚙️ Other / Custom Color…</option>
      </select>

      {showCustomInput && (
        <div className="relative animate-in fade-in duration-150">
          <input
            type="text"
            className={`${inputClass} ${size === 'sm' ? 'text-xs py-1 px-2.5 font-bold border-sky-300 bg-sky-50/30' : 'text-sm font-medium border-sky-300 bg-sky-50/20'} focus:bg-white pr-8`}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            placeholder={customPlaceholder}
            autoFocus={isCustomMode && !value}
          />
          {value && !disabled && (
            <button
              type="button"
              onClick={() => {
                setIsCustomMode(false);
                onChange('');
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Clear custom color"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Clean, modern Color Selection with 1-click preset chips + seamless custom color toggle.
 * Eliminates triple-redundancy and vertical clutter.
 */
export function ColorChipsInput({
  value,
  onChange,
  colors = COMMON_COLORS,
  placeholder = 'Type custom color…',
}: {
  value: string;
  onChange: (val: string) => void;
  colors?: readonly string[];
  placeholder?: string;
}) {
  const isPredefined = colors.some((c) => c.toLowerCase().trim() === value.toLowerCase().trim());
  const [isCustomMode, setIsCustomMode] = useState(false);
  const showCustom = isCustomMode || (!isPredefined && Boolean(value && value.trim()));

  return (
    <div className="space-y-2">
      {/* 1-Click Color Chips */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {colors.map((c) => {
          const isSelected = value.toLowerCase().trim() === c.toLowerCase().trim();
          const dotCss = colorToCss(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => {
                setIsCustomMode(false);
                onChange(isSelected ? '' : c);
              }}
              className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition border cursor-pointer ${
                isSelected
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100'
              }`}
            >
              <span className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${isSelected ? 'ring-1 ring-white' : ''} ${dotCss}`} />
              {c}
            </button>
          );
        })}

        {/* Custom Toggle Button */}
        <button
          type="button"
          onClick={() => {
            setIsCustomMode((prev) => !prev);
            if (isPredefined) onChange('');
          }}
          className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition border cursor-pointer ${
            showCustom
              ? 'bg-sky-50 text-sky-700 border-sky-300 shadow-2xs ring-1 ring-sky-200'
              : 'bg-white text-slate-600 border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-50'
          }`}
        >
          <span>⚙️</span>
          <span>{showCustom ? 'Custom:' : 'Other…'}</span>
        </button>
      </div>

      {/* Expandable Custom Color Input - only shown when selected */}
      {showCustom && (
        <div className="relative max-w-sm animate-in fade-in slide-in-from-top-1 duration-150">
          <input
            type="text"
            className={`${inputClass} text-xs font-semibold border-sky-300 bg-sky-50/20 focus:bg-white pr-8`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                setIsCustomMode(false);
                onChange('');
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Clear custom color"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Select dropdown for artwork/printing with suggestions + custom typing option */
export function PrintingSelect({
  value,
  onChange,
  designs = COMMON_PRINTING_DESIGNS,
  placeholder = 'Select Artwork / Print…',
  customPlaceholder = 'Type custom artwork specification…',
  className = '',
  size = 'md',
  disabled = false,
}: {
  value: string;
  onChange: (val: string) => void;
  designs?: readonly string[];
  placeholder?: string;
  customPlaceholder?: string;
  className?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
}) {
  const isPredefined = designs.some((d) => d.toLowerCase().trim() === value.toLowerCase().trim());
  const [isCustomMode, setIsCustomMode] = useState(false);
  const showCustomInput = isCustomMode || (!isPredefined && Boolean(value && value.trim()));

  const matchedDesign = designs.find((d) => d.toLowerCase().trim() === value.toLowerCase().trim()) || '';
  const selectValue = showCustomInput ? '__custom__' : matchedDesign;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <select
        className={`${inputClass} ${size === 'sm' ? 'text-xs py-1.5 px-2.5 font-bold border-indigo-200 bg-indigo-50/20' : 'text-sm font-semibold border-indigo-300'} ${
          showCustomInput ? 'border-indigo-400 bg-indigo-50/30' : ''
        }`}
        value={selectValue}
        disabled={disabled}
        onChange={(e) => {
          const val = e.target.value;
          if (val === '__custom__') {
            setIsCustomMode(true);
            if (isPredefined) {
              onChange('');
            }
          } else {
            setIsCustomMode(false);
            onChange(val);
          }
        }}
      >
        <option value="">{placeholder}</option>
        <optgroup label="Standard Artwork & Screen Print Finishes">
          {designs.map((d) => (
            <option key={d} value={d}>
              🖨️ {d}
            </option>
          ))}
        </optgroup>
        <option value="__custom__">⚙️ Other / Custom Artwork…</option>
      </select>

      {showCustomInput && (
        <div className="relative animate-in fade-in duration-150">
          <input
            type="text"
            className={`${inputClass} ${size === 'sm' ? 'text-xs py-1 px-2.5 font-bold border-indigo-300 bg-indigo-50/30' : 'text-sm font-medium border-indigo-300 bg-indigo-50/20'} focus:bg-white pr-8`}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            placeholder={customPlaceholder}
            autoFocus={isCustomMode && !value}
          />
          {value && !disabled && (
            <button
              type="button"
              onClick={() => {
                setIsCustomMode(false);
                onChange('');
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-700"
              title="Clear custom artwork"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Clean, modern Printing / Artwork finish selection chips + expandable custom specification input.
 * Replaces triple-redundancy with space-efficient design.
 */
export function PrintingChipsInput({
  value,
  onChange,
  designs = COMMON_PRINTING_DESIGNS,
  placeholder = 'e.g. Gold Foil Stamping, Matte Black Screen Print…',
}: {
  value: string;
  onChange: (val: string) => void;
  designs?: readonly string[];
  placeholder?: string;
}) {
  const isPredefined = designs.some((d) => d.toLowerCase().trim() === value.toLowerCase().trim());
  const [isCustomMode, setIsCustomMode] = useState(false);
  const showCustom = isCustomMode || (!isPredefined && Boolean(value && value.trim()));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {designs.map((d) => {
          const isSelected = value.toLowerCase().trim() === d.toLowerCase().trim();
          return (
            <button
              key={d}
              type="button"
              onClick={() => {
                setIsCustomMode(false);
                onChange(isSelected ? '' : d);
              }}
              className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition border cursor-pointer ${
                isSelected
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs ring-2 ring-indigo-200'
                  : 'bg-white text-indigo-900 border-indigo-200/80 hover:border-indigo-400 hover:bg-indigo-50/50 active:bg-indigo-100'
              }`}
            >
              <span className="text-[11px]">✨</span>
              {d}
            </button>
          );
        })}

        {/* Custom Toggle Button */}
        <button
          type="button"
          onClick={() => {
            setIsCustomMode((prev) => !prev);
            if (isPredefined) onChange('');
          }}
          className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition border cursor-pointer ${
            showCustom
              ? 'bg-indigo-100 text-indigo-800 border-indigo-300 shadow-2xs ring-1 ring-indigo-200'
              : 'bg-white text-indigo-700 border-dashed border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50/50'
          }`}
        >
          <span>⚙️</span>
          <span>{showCustom ? 'Custom Artwork:' : 'Other Print…'}</span>
        </button>
      </div>

      {showCustom && (
        <div className="relative max-w-sm animate-in fade-in slide-in-from-top-1 duration-150">
          <input
            type="text"
            className={`${inputClass} text-xs font-semibold border-indigo-300 bg-indigo-50/20 focus:bg-white pr-8`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                setIsCustomMode(false);
                onChange('');
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Clear custom artwork"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
