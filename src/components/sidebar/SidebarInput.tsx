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
}

export const SidebarInput: React.FC<SidebarInputProps> = ({
    label,
    value,
    onChange,
    maxBytes,
    placeholder,
    type = "text",
    helperText,
}) => {
    const byteLen = new TextEncoder().encode(value).length;
    const isNear = maxBytes !== undefined && byteLen >= maxBytes * 0.8;
    const isOver = maxBytes !== undefined && byteLen > maxBytes;

    const counterClass = isOver
        ? `${styles.charCounter} ${styles.charCounterOver}`
        : isNear
            ? `${styles.charCounter} ${styles.charCounterNear}`
            : styles.charCounter;

    return (
        <div className={styles.section}>
            <span className={styles.label}>{label}</span>
            <input
                className={styles.input}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                type={type}
            />
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
