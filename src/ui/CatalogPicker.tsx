// Offline catalog autocomplete: priority chips + search over the local mirror.
// Supports the "Otro → free text" sentinel (permite_otro_texto).
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet } from 'react-native';
import type { Campo } from '../forms/types';
import { OTRO } from '../forms/types';
import { rankCatalog, type CatalogItem } from '../catalog/search';
import { getCatalogItems } from '../db/catalogMirror';

interface Props {
  campo: Campo;
  value: string | undefined;        // selected id, or OTRO
  onChange: (id: string | undefined) => void;
}

export function CatalogPicker({ campo, value, onChange }: Props) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const tabla = campo.binding.catalogo!;

  useEffect(() => { getCatalogItems(tabla).then(setItems); }, [tabla]);

  const results = useMemo(
    () => rankCatalog({ query: q, items, prioritarias: campo.opciones_prioritarias, limit: 25 }),
    [q, items, campo.opciones_prioritarias],
  );

  const selected = value === OTRO ? 'Otro' : items.find((i) => i.id === value)?.nombre;

  return (
    <View>
      <Pressable style={s.field} onPress={() => setOpen((o) => !o)}>
        <Text style={selected ? s.value : s.placeholder}>
          {selected ?? `Buscar ${campo.label.toLowerCase()}…`}
        </Text>
      </Pressable>

      {open && (
        <View style={s.panel}>
          <TextInput
            style={s.search} placeholder="Escribe para buscar…" value={q}
            onChangeText={setQ} autoCorrect={false}
          />
          {!q && campo.opciones_prioritarias?.length ? (
            <View style={s.chips}>
              {results.slice(0, 6).map((i) => (
                <Pressable key={i.id} style={s.chip}
                  onPress={() => { onChange(i.id); setOpen(false); setQ(''); }}>
                  <Text>{i.nombre}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <FlatList
            data={results} keyExtractor={(i) => i.id} style={s.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable style={s.row}
                onPress={() => { onChange(item.id); setOpen(false); setQ(''); }}>
                <Text>{item.nombre}</Text>
                {item.estado === 'pendiente' && <Text style={s.badge}>pendiente</Text>}
              </Pressable>
            )}
          />
          {campo.permite_otro_texto && (
            <Pressable style={[s.row, s.otro]}
              onPress={() => { onChange(OTRO); setOpen(false); setQ(''); }}>
              <Text style={s.otroText}>+ Otro (especificar)</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  field: { borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 12, backgroundColor: '#fff' },
  value: { color: '#111' }, placeholder: { color: '#999' },
  panel: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginTop: 4, backgroundColor: '#fff', maxHeight: 320 },
  search: { padding: 10, borderBottomWidth: 1, borderColor: '#eee' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 6 },
  chip: { backgroundColor: '#e8f0fe', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  list: { maxHeight: 220 },
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderColor: '#f2f2f2' },
  badge: { fontSize: 11, color: '#b8860b', backgroundColor: '#fff7e0', paddingHorizontal: 6, borderRadius: 8 },
  otro: { backgroundColor: '#fafafa' }, otroText: { color: '#1a73e8' },
});
