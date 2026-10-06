import { Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '../../components/Text';
import { BodyMap, highlightsFromIntensities } from '../../components/BodyMap/BodyMap';
import { VolumeBar } from '../../components/ProgressChart';
import { Card, Chip, EmptyState, Screen, SectionTitle } from '../../components/ui';
import { useQuery } from '../../db/client';
import { getMuscleVolume, getRegionVolume } from '../../db/queries/stats';
import { REGION_LABEL } from '../../lib/format';
import { c, font, space } from '../../lib/theme';
import { WEEKLY_TARGET, volumeIntensity, volumeStatus } from '../../lib/volume';

const WINDOWS = [
  { days: 7, label: '7 jours' },
  { days: 14, label: '14 jours' },
  { days: 30, label: '30 jours' },
];

const STATUS_COLOR = {
  none: c.border,
  low: c.warn,
  ok: c.ok,
  high: c.accent,
} as const;

export default function VolumeScreen() {
  const [days, setDays] = useState(7);
  const muscles = useQuery(() => getMuscleVolume(days), [days]);
  const regions = useQuery(() => getRegionVolume(days), [days]);

  const worked = muscles.filter((m) => m.sets > 0);
  const highlights = highlightsFromIntensities(
    muscles.map((m) => ({ muscle: m.muscle, intensity: volumeIntensity(m.sets) })),
  );
  const peak = Math.max(...muscles.map((m) => m.sets), WEEKLY_TARGET.high);
  const neglected = muscles.filter((m) => m.sets > 0 && m.sets < WEEKLY_TARGET.low);
  const untouched = muscles.filter((m) => m.sets === 0);

  return (
    <>
      <Stack.Screen options={{ title: 'Volume par muscle' }} />
      <Screen scroll edges={[]}>
        <View style={styles.windows}>
          {WINDOWS.map((w) => (
            <Chip key={w.days} label={w.label} active={days === w.days} onPress={() => setDays(w.days)} />
          ))}
        </View>

        {worked.length === 0 ? (
          <Card>
            <EmptyState
              icon="body"
              title="Aucune série sur la période"
              body="Le petit bonhomme se colore dès la première série enregistrée."
            />
          </Card>
        ) : (
          <>
            <Card>
              <View style={styles.bodyWrap}>
                <BodyMap highlights={highlights} view="both" size={140} />
              </View>
              <Text style={styles.caption}>
                Séries pondérées : un muscle principal compte 1, un secondaire 0,5. Repère
                d'hypertrophie : {WEEKLY_TARGET.low}–{WEEKLY_TARGET.high} séries par semaine.
              </Text>
            </Card>

            <SectionTitle>Par zone</SectionTitle>
            <Card style={styles.bars}>
              {regions
                .filter((r) => r.sets > 0)
                .map((r) => (
                  <VolumeBar
                    key={r.region}
                    label={REGION_LABEL[r.region]}
                    sets={r.sets}
                    max={Math.max(...regions.map((x) => x.sets), 1)}
                    tone={c.accent}
                  />
                ))}
            </Card>

            <SectionTitle>Par muscle</SectionTitle>
            <Card style={styles.bars}>
              {worked.map((m) => (
                <VolumeBar
                  key={m.muscle.id}
                  label={m.muscle.labelFr}
                  sets={m.sets}
                  max={peak}
                  tone={STATUS_COLOR[volumeStatus(m.sets)]}
                />
              ))}
            </Card>

            {days === 7 && (neglected.length > 0 || untouched.length > 0) ? (
              <Card>
                <SectionTitle>À surveiller</SectionTitle>
                {neglected.length ? (
                  <Text style={styles.note}>
                    <Text style={{ color: c.warn }}>Sous la fourchette</Text> —{' '}
                    {neglected.map((m) => `${m.muscle.labelFr} (${fmt(m.sets)})`).join(', ')}.
                  </Text>
                ) : null}
                {untouched.length ? (
                  <Text style={styles.note}>
                    <Text style={{ color: c.textFaint }}>Pas travaillé</Text> —{' '}
                    {untouched.map((m) => m.muscle.labelFr).join(', ')}.
                  </Text>
                ) : null}
              </Card>
            ) : null}
          </>
        )}
      </Screen>
    </>
  );
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

const styles = StyleSheet.create({
  windows: { flexDirection: 'row', gap: space.sm },
  bodyWrap: { alignItems: 'center' },
  caption: {
    color: c.textFaint,
    fontSize: 12,
    lineHeight: 18,
    marginTop: space.md,
    textAlign: 'center',
  },
  bars: { gap: 2 },
  note: { color: c.textDim, fontSize: 13, lineHeight: 20, marginTop: space.sm, ...font.tabular },
});
