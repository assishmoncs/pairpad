import React from 'react';

/** Labelled input inside the shared `.form-group` wrapper. */
const FormField = ({ id, label, type = 'text', value, onChange, rightElement, ...inputProps }) => (
  <div className="form-group">
    <label htmlFor={id}>{label}</label>
    <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
      <input
        type={type}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...inputProps}
      />
      {rightElement && (
        <div className="input-right-element" style={{ position: 'absolute', right: '8px' }}>
          {rightElement}
        </div>
      )}
    </div>
  </div>
);

export default FormField;
