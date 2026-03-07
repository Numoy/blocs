import React from 'react';
import styles from './Sidebar.module.css';

interface SidebarInputProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    maxBytes?: number;
    placeholder?: string;
    type?: string;
    helperText?: string;
    isInvalid?: boolean;
    invalidText?: string;
    min?: string;
    step?: string;
}

export const SidebarInput: React.FC<SidebarInputProps> = ({
    label,
    value,
    onChange,
    maxBytes,
    placeholder,
    type = "text",
    helperText,
    isInvalid,
    invalidText,
    min,
    step,
}) => {
    const byteLen = new TextEncoder().encode(value).length;
    const isNear = maxBytes !== undefined && byteLen >= maxBytes * 0.8;
    const isOver = maxBytes !== undefined && byteLen > maxBytes;

    const counterClass = isOver
        ? `${styles.charCounter} ${styles.charCounterOver}`
        : isNear
            ? `${styles.charCounter} ${styles.charCounterNear}`
            : styles.charCounter;

    const inputClass = isInvalid ? `${styles.input} ${styles.inputError}` : styles.input;

    return (
        <div className={styles.section}>
            <span className={styles.label}>{label}</span>
            <input
                className={inputClass}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                type={type}
                min={min}
                step={step}
            />
            {isInvalid && invalidText && (
                <div className={styles.errorText}>{invalidText}</div>
            )}
            {(maxBytes !== undefined || helperText) && (
                <div className={styles.inputFooter}>
                    <span className={styles.inputHelper}>{helperText}</span>
                    {maxBytes !== undefined && (
                        <span className={counterClass}>{byteLen} / {maxBytes}</span>
                    )}
                </div>
            )}
        </div>
    );
};
