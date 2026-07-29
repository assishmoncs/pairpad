import React from 'react';
import { LANGUAGES } from '../constants/languages';

/** Select listing every supported room / execution language. */
const LanguageSelect = ({ id = 'language', value, onChange }) => (
  <select id={id} value={value} onChange={onChange}>
    {LANGUAGES.map(({ value: languageValue, label }) => (
      <option key={languageValue} value={languageValue}>
        {label}
      </option>
    ))}
  </select>
);

export default LanguageSelect;
