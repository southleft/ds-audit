import React from 'react';

// Test 1: CSS Classes (utility-based)
export const UtilityButton = () => (
  <button className="bg-blue-500 text-gray-50 p-4 rounded-lg font-medium">
    Utility Classes
  </button>
);

// Test 2: Component Props
export const PropButton = ({ color = 'primary', size = 'medium' }) => (
  <button color={color} size={size}>
    Prop-based
  </button>
);

// Test 3: Theme API Usage
const theme = {
  colors: {
    primary: '#3b82f6',
    gray: {
      50: '#f9fafb'
    }
  },
  spacing: {
    md: '16px'
  }
};

export const ThemeButton = () => (
  <button 
    style={{
      backgroundColor: theme.colors.primary,
      color: theme.colors.gray[50],
      padding: theme.spacing.md
    }}
  >
    Theme API
  </button>
);

// Test 4: Design System API
export const DSButton = () => (
  <button 
    style={{
      backgroundColor: 'var(--color-primary-500)',
      padding: 'var(--spacing-md)'
    }}
  >
    CSS Variables
  </button>
);

// Test 5: Mixed usage with hardcoded values
export const MixedButton = () => (
  <button 
    className="btn-primary p-4"
    style={{
      backgroundColor: '#3b82f6', // Should match color.primary.500
      fontSize: '16px', // Should match typography.fontSize.base  
      fontWeight: 500, // Should match typography.fontWeight.medium
    }}
  >
    Mixed Usage
  </button>
);