import { formatMetres } from "../lib/format";
import css from "./Slider.module.css";

type Props = {
    label: string;
    value: number;
    max: number;
    step: number;
    hint?: string;
    onChange: (value: number) => void;
};

export const Slider = ({ label, value, max, step, hint, onChange }: Props) => (
    <label className={css.field}>
        <span className={css.header}>
            <span className={css.label}>{label}</span>
            <output className={`${css.value} numeric`}>{formatMetres(value)}</output>
        </span>
        <input
            type="range"
            min={0}
            max={max}
            step={step}
            value={value}
            className={css.range}
            onChange={event => onChange(Number(event.target.value))}
        />
        {hint && <span className={css.hint}>{hint}</span>}
    </label>
);
