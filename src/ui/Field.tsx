// Renders one field by type. Pure presentational — state lives in FormRenderer.
import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import type { Campo } from '../forms/types';
import { OTRO } from '../forms/types';
import { CatalogPicker } from './CatalogPicker';

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
      return (
        <TextInput style={s.input} keyboardType="numeric"
          value={value == null ? '' : String(value)} placeholder={campo.ejemplo}
          onChangeText={(t) => onChange(t === '' ? undefined : Number(t.replace(',', '.')))} />
      );
    case 'fecha':
      return (
        <TextInput style={s.input} placeholder="AAAA-MM-DD"
          value={value == null ? '' : String(value)} onChangeText={(t) => onChange(t || undefined)} />
      );
    case 'seleccion_unica':
      return (
        <View style={s.options}>
          {(campo.opciones ?? []).map((op) => (
            <Pressable key={op} onPress={() => onChange(op)}
              style={[s.option, value === op && s.optionSel]}>
              <Text style={value === op ? s.optionSelText : undefined}>{op}</Text>
            </Pressable>
          ))}
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
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { borderWidth: 1, borderColor: '#bbb', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff' },
  optionSel: { backgroundColor: '#1a73e8', borderColor: '#1a73e8' },
  optionSelText: { color: '#fff' },
  error: { color: '#c00', fontSize: 13, marginTop: 4 },
  todo: { color: '#999', fontStyle: 'italic', padding: 12 },
});
