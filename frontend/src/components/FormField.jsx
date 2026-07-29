import React from 'react';

/** Labelled input inside the shared `.form-group` wrapper. */
const FormField = ({ id, label, type = 'text', value, onChange, ...inputProps }) => (
  <div className="form-group">
    <label htmlFor={id}>{label}</label>
    <input
      type={type}
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...inputProps}
    />
  </div>
);

export default FormField;
