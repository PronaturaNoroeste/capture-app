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
import { rankCatalog, norm, catalogOutsiders, type CatalogItem } from '../catalog/search';
import { getCatalogItems, getListaItems, addLocalProposal } from '../db/catalogMirror';
import { color, font, radius, space, type } from './theme';
import { recordProposal } from '../forms/proposals';

interface Props {
  campo: Campo;
  value: string | undefined;        // selected id, or OTRO
  onChange: (id: string | undefined) => void;
}

export function CatalogPicker({ campo, value, onChange }: Props) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [catalogo, setCatalogo] = useState<CatalogItem[]>([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const tabla = campo.binding.catalogo!;

  // curated-list field → strict per-form subset; otherwise the full catalog
  useEffect(() => {
    (campo.lista ? getListaItems(campo.lista, tabla) : getCatalogItems(tabla)).then(setItems);
  }, [tabla, campo.lista]);

  // A curated list is a subset, so a name the técnico types may already exist in the
  // wider catalog without being listed. Keep the full mirror on hand to spot that.
  useEffect(() => {
    if (campo.lista) getCatalogItems(tabla).then(setCatalogo);
  }, [tabla, campo.lista]);

  const results = useMemo(
    () => rankCatalog({ query: q, items, prioritarias: campo.opciones_prioritarias, limit: 50 }),
    [q, items, campo.opciones_prioritarias],
  );

  const selected = value === OTRO ? 'Otro (especificado)' : items.find((i) => i.id === value)?.nombre;
  const pick = (id: string | undefined) => { onChange(id); setOpen(false); setQ(''); };

  const qTrim = q.trim();

  // Exists in the catalog but not in this list → offer the real row rather than let
  // the técnico mint a duplicate of it (see catalogOutsiders).
  const outsiders = useMemo(
    () => (campo.lista ? catalogOutsiders({ query: qTrim, listaItems: items, catalogItems: catalogo }) : []),
    [campo.lista, qTrim, items, catalogo],
  );
  // Picking an outsider adds it to this picker's items so it renders as the selection;
  // it is NOT a proposal — the row already exists and is approved, so nothing is sent.
  const pickOutsider = (item: CatalogItem) => {
    setItems((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, item]));
    pick(item.id);
  };

  // Propose a new catalog entry (offline): add it to the local mirror so it's
  // reusable immediately, buffer it for the sync payload, and select it. The list it
  // came from travels with it, so approval in the console can add it back to that list.
  const exactMatch = results.some((i) => norm(i.nombre) === norm(qTrim)) || outsiders.length > 0;
  const canPropose = !!campo.permite_proponer && qTrim.length >= 2 && !exactMatch;
  const propose = async () => {
    const id = uuidv4();
    recordProposal({ tabla, id, nombre: qTrim, lista: campo.lista });
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
            style={s.search} placeholder="Escribe para buscar…" placeholderTextColor={color.stone}
            value={q} onChangeText={setQ} autoCorrect={false} autoFocus
          />
          {!q && campo.opciones_prioritarias?.length ? (
            <View style={s.chips}>
              {results.slice(0, 8).map((i) => (
                <Pressable key={i.id} style={s.chip} onPress={() => pick(i.id)}>
                  <Text style={s.chipText}>{i.nombre}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <FlatList
            data={results} keyExtractor={(i) => i.id} style={s.list}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <>
                {outsiders.map((i) => (
                  <Pressable key={i.id} style={[s.row, s.outsider]} onPress={() => pickOutsider(i)}>
                    <Text style={s.rowText}>{i.nombre}</Text>
                    <Text style={s.outsiderHint}>ya existe · fuera de esta lista</Text>
                  </Pressable>
                ))}
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
  field: { borderWidth: 1, borderColor: color.fog, borderRadius: radius.input, padding: space.md, backgroundColor: color.canvas },
  value: { color: color.ink, fontFamily: font.regular, fontSize: type.input },
  placeholder: { color: color.stone, fontFamily: font.regular, fontSize: type.input },
  modal: { flex: 1, backgroundColor: color.canvas, paddingTop: 44 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space.lg },
  title: { fontSize: type.sectionTitle, fontFamily: font.semibold, color: color.ink },
  close: { color: color.tide, fontSize: type.input, fontFamily: font.medium },
  search: { marginHorizontal: space.lg, padding: space.md, borderWidth: 1, borderColor: color.fog, borderRadius: radius.input, color: color.ink, fontFamily: font.regular, fontSize: type.input },
  chips: { flexDirection: 'row', flexWrap: 'wrap', padding: space.md, gap: space.sm },
  chip: { backgroundColor: color.tideSoft, borderRadius: radius.button, paddingHorizontal: space.md, paddingVertical: space.sm },
  chipText: { color: color.tide, fontFamily: font.medium },
  list: { flex: 1, marginTop: space.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: 1, borderColor: color.fog },
  rowText: { fontSize: type.input, color: color.ink, fontFamily: font.regular },
  badge: { fontSize: type.badge, color: color.warning, backgroundColor: color.warningSoft, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.badge, fontFamily: font.semibold },
  otro: { backgroundColor: color.shell }, otroText: { color: color.tide, fontSize: type.input, fontFamily: font.medium },
  outsider: { backgroundColor: color.shell },
  outsiderHint: { color: color.stone, fontSize: type.caption, fontFamily: font.regular },
  propose: { backgroundColor: color.warningSoft },
  proposeText: { color: color.warning, fontSize: type.input, fontFamily: font.semibold },
  proposeHint: { color: color.warning, fontSize: type.caption, fontFamily: font.regular },
  empty: { color: color.stone, textAlign: 'center', padding: space.xl, fontFamily: font.regular },
});
