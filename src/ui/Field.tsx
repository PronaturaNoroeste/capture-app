// Renders one field by type. Pure presentational — state lives in FormRenderer.
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { Campo } from '../forms/types';
import { OTRO, opLabel, opValor } from '../forms/types';
import { CatalogPicker } from './CatalogPicker';

// Date field: tap to open the OS calendar dialog (GMS-free). Stores the value as a
// local 'YYYY-MM-DD' string — same format the rest of the pipeline already expects.
function DateField({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const [show, setShow] = useState(false);
  const hasValue = typeof value === 'string' && value !== '';
  // parse as local midnight (no 'Z') so the day never shifts by timezone
  const current = hasValue ? new Date(value + 'T00:00:00') : new Date();
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return (
    <>
      <Pressable style={s.input} onPress={() => setShow(true)}>
        <Text style={hasValue ? undefined : s.placeholder}>
          {hasValue ? (value as string) : 'Seleccionar fecha…'}
        </Text>
      </Pressable>
      {show && (
        <DateTimePicker
          value={current}
          mode="date"
          maximumDate={new Date()}
          onChange={(event, d) => {
            setShow(false);                                   // Android dialog is one-shot
            if (event.type === 'set' && d) onChange(fmt(d));
          }}
        />
      )}
    </>
  );
}

// Numeric input keeps the raw text locally so partial entries like "4." survive
// (parsing to Number on every keystroke would strip the trailing dot). Emits a
// number (or undefined) upward; allows one decimal separator.
function NumericInput({ value, ejemplo, decimales, onChange }:
  { value: unknown; ejemplo?: string; decimales?: number; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => { if (value == null) setText(''); }, [value]);   // reset on new faena
  return (
    <TextInput
      style={s.input} keyboardType="decimal-pad" placeholder={ejemplo}
      value={text}
      onChangeText={(t) => {
        let c = t.replace(',', '.').replace(/[^0-9.]/g, '');       // digits + one dot
        const i = c.indexOf('.');
        if (i >= 0) c = c.slice(0, i + 1) + c.slice(i + 1).replace(/\./g, '');
        // cap digits after the decimal point (e.g. decimales=1 → 35.5, not 35.55)
        if (decimales != null && c.includes('.')) c = c.slice(0, c.indexOf('.') + 1 + decimales);
        setText(c);
        if (c === '' || c === '.') { onChange(undefined); return; }
        const n = Number(c);
        onChange(Number.isNaN(n) ? undefined : n);
      }}
    />
  );
}

interface Props {
  campo: Campo;
  value: unknown;
  error?: string;
  onChange: (v: unknown) => void;
}

export function Field({ campo, value, error, onChange }: Props) {
  return (
    <View style={s.wrap}>
      <Text style={s.label}>
        {campo.label}{campo.requerido ? ' *' : ''}
      </Text>
      {campo.ayuda ? <Text style={s.help}>{campo.ayuda}</Text> : null}
      {renderInput(campo, value, onChange)}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

function renderInput(campo: Campo, value: unknown, onChange: (v: unknown) => void) {
  switch (campo.tipo) {
    case 'entero':
    case 'decimal':
      return <NumericInput value={value} ejemplo={campo.ejemplo} decimales={campo.decimales} onChange={onChange} />;
    case 'fecha':
      return <DateField value={value} onChange={onChange} />;
    case 'seleccion_unica':
      return (
        <View style={s.options}>
          {(campo.opciones ?? []).map((op) => {
            const label = opLabel(op), valor = opValor(op);
            return (
              <Pressable key={valor} onPress={() => onChange(valor)}
                style={[s.option, value === valor && s.optionSel]}>
                <Text style={value === valor ? s.optionSelText : undefined}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      );
    case 'booleano':
      return (
        <Pressable style={[s.option, value === true && s.optionSel]} onPress={() => onChange(!value)}>
          <Text>{value ? 'Sí' : 'No'}</Text>
        </Pressable>
      );
    case 'catalogo':
      return <CatalogPicker campo={campo} value={value as string | undefined} onChange={onChange} />;
    case 'geo':
      return <Text style={s.todo}>📍 (selector de mapa — pendiente)</Text>;
    case 'foto':
      return <Text style={s.todo}>📷 (foto — pendiente)</Text>;
    case 'texto':
    default:
      return (
        <TextInput style={s.input} value={value == null ? '' : String(value)}
          placeholder={campo.ejemplo} onChangeText={(t) => onChange(t || undefined)} multiline />
      );
  }
}

export { OTRO };

const s = StyleSheet.create({
  wrap: { marginBottom: 16 },
  label: { fontWeight: '600', marginBottom: 4 },
  help: { color: '#666', fontSize: 13, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 12, backgroundColor: '#fff' },
  placeholder: { color: '#999' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { borderWidth: 1, borderColor: '#bbb', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff' },
  optionSel: { backgroundColor: '#1a73e8', borderColor: '#1a73e8' },
  optionSelText: { color: '#fff' },
  error: { color: '#c00', fontSize: 13, marginTop: 4 },
  todo: { color: '#999', fontStyle: 'italic', padding: 12 },
});
