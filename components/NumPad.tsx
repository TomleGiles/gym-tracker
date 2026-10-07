import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from './Text';
import { c, font, radius, space } from '../lib/theme';
import { Icon } from './ui';

export type NumPadField = 'weight' | 'reps';

export type NumPadRequest = {
  /**
   * Identité de la cellule ouverte, stable d'un rendu à l'autre.
   * Sans elle, le pavé se réinitialiserait à chaque frappe : `request` est un
   * objet recréé à chaque rendu du parent, et l'effet de remise à zéro se
   * redéclencherait — chaque chiffre remplacerait le précédent au lieu de
   * s'y ajouter.
   */
  key: string;
  title: string;
  subtitle: string;
  field: NumPadField;
  weight: string;
  reps: string;
  /** Pas du ± sur la charge : 2,5 kg à la barre, 5 kg sur une machine. */
  weightStep: number;
};

/**
 * Pavé numérique maison (§11 : « le clavier natif ruine le mode séance »).
 * Grosses touches, pas de saisie au doigt millimétré, ± en accès direct, et
 * surtout : il ne pousse pas la liste vers le haut à chaque ouverture.
 */
export function NumPad({
  request,
  onChange,
  onValidate,
  onClose,
}: {
  request: NumPadRequest | null;
  onChange: (patch: { weight?: string; reps?: string }) => void;
  onValidate: () => void;
  onClose: () => void;
}) {
  const [field, setField] = useState<NumPadField>('weight');
  /** Une frappe chiffre après ouverture remplace la valeur pré-remplie. */
  const fresh = useRef(true);

  const openKey = request?.key ?? null;
  const initialField = request?.field;
  useEffect(() => {
    if (!openKey || !initialField) return;
    setField(initialField);
    fresh.current = true;
  }, [openKey, initialField]);

  if (!request) return null;

  const current = field === 'weight' ? request.weight : request.reps;
  const step = field === 'weight' ? request.weightStep : 1;

  const tick = () => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
  };

  function emit(next: string) {
    onChange(field === 'weight' ? { weight: next } : { reps: next });
  }

  function press(key: string) {
    tick();
    if (key === 'del') {
      fresh.current = false;
      emit(current.length <= 1 ? '' : current.slice(0, -1));
      return;
    }
    if (key === ',') {
      if (field === 'reps' || current.includes(',')) return;
      fresh.current = false;
      emit((current || '0') + ',');
      return;
    }
    const base = fresh.current ? '' : current;
    fresh.current = false;
    const next = base === '0' ? key : base + key;
    if (next.replace(',', '').length > 5) return;
    emit(next);
  }

  function bump(delta: number) {
    tick();
    fresh.current = false;
    const value = parseFr(current) + delta;
    const clamped = Math.max(0, Math.round(value * 100) / 100);
    emit(field === 'reps' ? String(Math.round(clamped)) : formatFr(clamped));
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer le pavé" />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={styles.title} numberOfLines={1}>
              {request.title}
            </Text>
            <Text style={styles.subtitle}>{request.subtitle}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Fermer le pavé numérique" onPress={onClose} hitSlop={10} style={styles.close}>
            <Icon name="chevron-down" size={22} color={c.textDim} />
          </Pressable>
        </View>

        <View style={styles.fields}>
          <FieldCell
            label="kg"
            value={request.weight || '—'}
            active={field === 'weight'}
            onPress={() => {
              setField('weight');
              fresh.current = true;
            }}
          />
          <FieldCell
            label="reps"
            value={request.reps || '—'}
            active={field === 'reps'}
            onPress={() => {
              setField('reps');
              fresh.current = true;
            }}
          />
        </View>

        <View style={styles.bumpRow}>
          <BumpButton label={`− ${formatFr(step)}`} onPress={() => bump(-step)} />
          <BumpButton label={`+ ${formatFr(step)}`} onPress={() => bump(step)} />
        </View>

        <View style={styles.grid}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'].map((key) => (
            <Key key={key} value={key} onPress={() => press(key)} disabled={key === ',' && field === 'reps'} />
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Valider la série"
          onPress={onValidate}
          style={({ pressed }) => [styles.validate, pressed && { opacity: 0.7 }]}
        >
          <Icon name="checkmark" size={22} color={c.bg} />
          <Text style={styles.validateLabel}>Valider la série</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

function FieldCell({
  label,
  value,
  active,
  onPress,
}: {
  label: string;
  value: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} : ${value}`} accessibilityState={{ selected: active }} onPress={onPress} style={[styles.fieldCell, active && styles.fieldCellActive]}>
      <Text style={[styles.fieldValue, font.tabular, active && { color: c.text }]}>{value}</Text>
      <Text style={styles.fieldLabel}>{label}</Text>
    </Pressable>
  );
}

function BumpButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.bump, pressed && { opacity: 0.6 }]}>
      <Text style={[styles.bumpLabel, font.tabular]}>{label}</Text>
    </Pressable>
  );
}

function Key({ value, onPress, disabled }: { value: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value === 'del' ? 'Effacer le dernier chiffre' : value}
      disabled={disabled}
      style={({ pressed }) => [styles.key, pressed && styles.keyPressed, disabled && { opacity: 0.3 }]}
    >
      {value === 'del' ? (
        <Icon name="backspace-outline" size={22} color={c.text} />
      ) : (
        <Text style={[styles.keyLabel, font.tabular]}>{value}</Text>
      )}
    </Pressable>
  );
}

/** Le clavier est français : la virgule est le séparateur décimal. */
export const parseFr = (s: string): number => {
  const n = Number.parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export const formatFr = (n: number): string =>
  (Math.round(n * 100) / 100).toString().replace('.', ',');

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.78)' },
  sheet: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    marginTop: 'auto',
    backgroundColor: c.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: c.border,
    padding: space.lg,
    gap: space.md,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, alignSelf: 'center', marginTop: -4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headText: { flex: 1 },
  title: { color: c.text, fontSize: 16, fontWeight: '700' },
  subtitle: { color: c.textDim, fontSize: 13 },
  close: { padding: space.xs },

  fields: { flexDirection: 'row', gap: space.md },
  fieldCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: c.surfaceAlt,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  fieldCellActive: { borderColor: c.accent, backgroundColor: c.accentDim },
  fieldValue: { color: c.textDim, fontSize: 38, ...font.display },
  fieldLabel: { color: c.textFaint, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  bumpRow: { flexDirection: 'row', gap: space.md },
  bump: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.border,
  },
  bumpLabel: { color: c.text, fontSize: 16, fontWeight: '700' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  key: {
    width: '31.5%',
    flexGrow: 1,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: c.surfaceAlt,
  },
  keyPressed: { backgroundColor: c.borderStrong },
  keyLabel: { color: c.text, fontSize: 24, fontWeight: '600' },

  validate: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.lg,
    backgroundColor: c.accent,
  },
  validateLabel: { color: c.bg, fontSize: 17, fontWeight: '800' },
});
