// Offline catalog autocomplete: priority chips + search over the local mirror.
// Presented as a Modal so its scrollable list is never nested inside the form's
// ScrollView (which RN forbids for same-orientation VirtualizedLists).
// Supports the "Otro → free text" sentinel (permite_otro_texto).
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, Modal, StyleSheet } from 'react-native';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import type { Campo } from '../forms/types';
import { OTRO } from '../forms/types';
import { rankCatalog, norm, type CatalogItem } from '../catalog/search';
import { getCatalogItems, addLocalProposal } from '../db/catalogMirror';
import { recordProposal } from '../forms/proposals';

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
    () => rankCatalog({ query: q, items, prioritarias: campo.opciones_prioritarias, limit: 50 }),
    [q, items, campo.opciones_prioritarias],
  );

  const selected = value === OTRO ? 'Otro (especificado)' : items.find((i) => i.id === value)?.nombre;
  const pick = (id: string | undefined) => { onChange(id); setOpen(false); setQ(''); };

  // Propose a new catalog entry (offline): add it to the local mirror so it's
  // reusable immediately, buffer it for the sync payload, and select it.
  const qTrim = q.trim();
  const exactMatch = results.some((i) => norm(i.nombre) === norm(qTrim));
  const canPropose = !!campo.permite_proponer && qTrim.length >= 2 && !exactMatch;
  const propose = async () => {
    const id = uuidv4();
    recordProposal({ tabla, id, nombre: qTrim });
    await addLocalProposal(tabla, id, qTrim);
    setItems((prev) => [...prev, { id, nombre: qTrim, estado: 'pendiente' }]);
    pick(id);
  };

  return (
    <>
      <Pressable style={s.field} onPress={() => setOpen(true)}>
        <Text style={selected ? s.value : s.placeholder}>
          {selected ?? `Buscar ${campo.label.toLowerCase()}…`}
        </Text>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={s.modal}>
          <View style={s.header}>
            <Text style={s.title}>{campo.label}</Text>
            <Pressable onPress={() => setOpen(false)}><Text style={s.close}>Cerrar</Text></Pressable>
          </View>
          <TextInput
            style={s.search} placeholder="Escribe para buscar…" value={q}
            onChangeText={setQ} autoCorrect={false} autoFocus
          />
          {!q && campo.opciones_prioritarias?.length ? (
            <View style={s.chips}>
              {results.slice(0, 8).map((i) => (
                <Pressable key={i.id} style={s.chip} onPress={() => pick(i.id)}>
                  <Text>{i.nombre}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <FlatList
            data={results} keyExtractor={(i) => i.id} style={s.list}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <>
                {canPropose ? (
                  <Pressable style={[s.row, s.propose]} onPress={propose}>
                    <Text style={s.proposeText}>+ Proponer «{qTrim}»</Text>
                    <Text style={s.proposeHint}>se revisará después</Text>
                  </Pressable>
                ) : null}
                {campo.permite_otro_texto ? (
                  <Pressable style={[s.row, s.otro]} onPress={() => pick(OTRO)}>
                    <Text style={s.otroText}>+ Otro (especificar)</Text>
                  </Pressable>
                ) : null}
              </>
            }
            ListEmptyComponent={
              <Text style={s.empty}>
                {items.length === 0
                  ? 'Sin datos en caché. Conéctate a internet y reinicia la app.'
                  : 'Sin coincidencias.'}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable style={s.row} onPress={() => pick(item.id)}>
                <Text style={s.rowText}>{item.nombre}</Text>
                {item.estado === 'pendiente' && <Text style={s.badge}>pendiente</Text>}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  field: { borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 12, backgroundColor: '#fff' },
  value: { color: '#111' }, placeholder: { color: '#999' },
  modal: { flex: 1, backgroundColor: '#fff', paddingTop: 44 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  title: { fontSize: 18, fontWeight: '700' }, close: { color: '#1a73e8', fontSize: 16 },
  search: { marginHorizontal: 16, padding: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },
  chip: { backgroundColor: '#e8f0fe', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  list: { flex: 1, marginTop: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: '#f2f2f2' },
  rowText: { fontSize: 16 },
  badge: { fontSize: 11, color: '#b8860b', backgroundColor: '#fff7e0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  otro: { backgroundColor: '#fafafa' }, otroText: { color: '#1a73e8', fontSize: 16 },
  propose: { backgroundColor: '#fff7e0' },
  proposeText: { color: '#b8860b', fontSize: 16, fontWeight: '600' },
  proposeHint: { color: '#b8860b', fontSize: 12 },
  empty: { color: '#888', textAlign: 'center', padding: 24 },
});
