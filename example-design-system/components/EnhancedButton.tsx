import React from 'react';

interface ButtonProps {
  variant?: 'primary' | 'secondary';
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  'aria-label'?: string;
}

export const EnhancedButton: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'medium',
  onClick,
  children,
  disabled = false,
  'aria-label': ariaLabel,
}) => {
  return (
    <button
      className={`btn btn-${variant} btn-${size} bg-blue-500 text-white p-4 rounded-lg`}
      style={{
        backgroundColor: 'var(--color-primary-500)',
        color: '#f9fafb',
        padding: '16px', // Should match spacing.md
        borderRadius: '8px',
        fontSize: '16px', // Should match typography.fontSize.base
        fontWeight: '500' // Should match typography.fontWeight.medium
      }}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
};

// CSS-in-JS usage
const buttonStyles = {
  primary: {
    backgroundColor: 'var(--color-primary-500)',
    color: '#f9fafb', // This should match gray.50
  },
  secondary: {
    backgroundColor: '#6b7280', // This should match gray.500
    color: '#f9fafb',
  }
};

// Theme API usage
const theme = {
  colors: {
    primary: '#3b82f6'
  }
};

// Component with theme usage
export const ThemedButton = () => (
  <button style={{ backgroundColor: theme.colors.primary }}>
    Themed Button
  </button>
);