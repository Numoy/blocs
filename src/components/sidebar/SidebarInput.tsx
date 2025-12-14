import React from 'react';
import styles from './Sidebar.module.css';

interface SidebarInputProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    maxLength?: number;
    placeholder?: string;
    type?: string;
}

export const SidebarInput: React.FC<SidebarInputProps> = ({
    label,
    value,
    onChange,
    maxLength,
    placeholder,
    type = "text"
}) => {
    return (
        <div className={styles.section}>
            <span className={styles.label}>{label}</span>
            <input
                className={styles.input}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                maxLength={maxLength}
                placeholder={placeholder}
                type={type}
            />
        </div>
    );
};
