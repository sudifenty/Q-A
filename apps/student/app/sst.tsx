import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import questionRows from '../data/sst_questions_p3_p7.json';
import { effectiveFilters, useRemoteState } from '../lib/remote';
import type { SSTClass } from '../lib/sstSequence';
import { SST_SEQUENCE_LABEL, SST_TOTAL_QUESTIONS } from '../lib/sstSequence';

type SSTQuestionOnly = {
  id: string;
  source_number: number;
  class: SSTClass;
  subject: 'SST';
  topic: string;
  prompt: string;
  options: string[] | null;
};

const BANK = questionRows as SSTQuestionOnly[];
const LETTERS = ['A', 'B', 'C', 'D'];

function isSSTSubject(subject: string | null) {
  return !!subject && ['sst', 'social studies'].includes(subject.trim().toLowerCase());
}

/** Every learner follows the same P3→P7 order; no class/topic gates or answer key. */
export default function SSTRevision() {
  const router = useRouter();
  const remote = useRemoteState();
  const f = effectiveFilters(remote.profile?.class ?? null);
  const [index, setIndex] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<Record<number, number>>({});
  const [complete, setComplete] = useState(false);

  // Keep the existing teacher subject/mode permissions, but intentionally do
  // not restrict this shared bank by the student's profile or forced class.
  const subjectAllowed = !f.subject || isSSTSubject(f.subject);
  const modeAllowed = f.allowPracticeAnswers || f.allowPracticeNoAnswers;
  const canOpen = subjectAllowed && modeAllowed;
  useEffect(() => {
    if (!canOpen) router.replace('/');
  }, [canOpen, router]);

  if (!canOpen) return null;

  if (complete) {
    return (
      <View style={s.completePage}>
        <Pressable style={s.back} onPress={() => router.back()}><Text style={s.backText}>← Home</Text></Pressable>
        <Text style={s.completeEmoji}>🎉</Text>
        <Text style={s.title}>SST sequence complete!</Text>
        <Text style={s.subtitle}>You reached the end of all {SST_TOTAL_QUESTIONS.toLocaleString()} questions, from P3 through P7.</Text>
        <Pressable style={s.primaryButton} onPress={() => { setIndex(0); setSelectedOptions({}); setComplete(false); }}>
          <Text style={s.primaryButtonText}>Start again from P3</Text>
        </Pressable>
      </View>
    );
  }

  const question = BANK[index];
  const percentage = Math.round(((index + 1) / BANK.length) * 100);
  const selected = selectedOptions[index];

  const previous = () => setIndex(i => Math.max(0, i - 1));
  const next = () => {
    if (index + 1 >= BANK.length) setComplete(true);
    else setIndex(i => i + 1);
  };

  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      <Pressable style={s.back} onPress={() => router.back()}><Text style={s.backText}>← Home</Text></Pressable>
      <Text style={s.title}>SST · P3 to P7</Text>
      <Text style={s.subtitle}>{SST_SEQUENCE_LABEL} · one shared sequence for every student</Text>
      <View style={s.notice}>
        <Text style={s.noticeText}>Questions only · no answer key · choices are unmarked and not auto-scored</Text>
      </View>

      <View style={s.progressHeader}>
        <Text style={s.progressCount}>Q{question.source_number} of {SST_TOTAL_QUESTIONS.toLocaleString()}</Text>
        <Text style={s.classBadge}>{question.class}</Text>
      </View>
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${percentage}%` as `${number}%` }]} />
      </View>
      <Text style={s.topic}>{question.topic}</Text>

      <View style={s.questionCard}>
        <Text style={s.questionNumber}>Question {question.source_number}</Text>
        <Text style={s.questionText}>{question.prompt}</Text>
        {question.options?.map((option, i) => (
          <Pressable
            key={`${question.id}-${i}`}
            style={[s.option, selected === i && s.optionSelected]}
            onPress={() => setSelectedOptions(prev => ({ ...prev, [index]: i }))}
          >
            <Text style={[s.optionLetter, selected === i && s.optionLetterSelected]}>{LETTERS[i]}.</Text>
            <Text style={[s.optionText, selected === i && s.optionTextSelected]}>{option}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.navRow}>
        <Pressable style={[s.secondaryButton, index === 0 && s.disabledButton]} disabled={index === 0} onPress={previous}>
          <Text style={s.secondaryButtonText}>← Previous</Text>
        </Pressable>
        <Pressable style={s.primaryButton} onPress={next}>
          <Text style={s.primaryButtonText}>{index + 1 === BANK.length ? 'Finish SST' : 'Next question →'}</Text>
        </Pressable>
      </View>
      {index + 1 < BANK.length && BANK[index + 1].class !== question.class && (
        <Text style={s.transitionHint}>Next is {BANK[index + 1].class}; tap Next to continue—there is no class-end screen.</Text>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFF6E6' },
  content: { padding: 16, paddingBottom: 32 },
  completePage: { flex: 1, backgroundColor: '#FFF6E6', padding: 20, justifyContent: 'center', alignItems: 'center' },
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12, marginBottom: 8 },
  backText: { color: '#2D6CDF', fontWeight: '800', fontSize: 15 },
  title: { color: '#2D4159', fontSize: 24, fontWeight: '900', marginBottom: 3 },
  subtitle: { color: '#8A7F6A', marginBottom: 12 },
  notice: { backgroundColor: '#FFF3D6', borderColor: '#F0D99B', borderWidth: 1, borderRadius: 12, padding: 11, marginBottom: 14 },
  noticeText: { color: '#7A5B00', fontSize: 12, fontWeight: '800' },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressCount: { color: '#2D4159', fontSize: 14, fontWeight: '900' },
  classBadge: { color: '#1D4ED8', backgroundColor: '#E7F0FF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, fontWeight: '900' },
  progressTrack: { height: 8, backgroundColor: '#E6DCC8', borderRadius: 5, overflow: 'hidden', marginTop: 8, marginBottom: 10 },
  progressFill: { height: 8, backgroundColor: '#2D6CDF', borderRadius: 5 },
  topic: { color: '#8A7F6A', fontSize: 13, fontWeight: '800', marginBottom: 8 },
  questionCard: { backgroundColor: '#fff', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#EFE6D2', marginBottom: 12 },
  questionNumber: { color: '#2D6CDF', fontSize: 12, fontWeight: '900', marginBottom: 6 },
  questionText: { color: '#2D4159', fontSize: 18, lineHeight: 26, fontWeight: '800', marginBottom: 8 },
  option: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1.5, borderColor: '#E6DCC8', borderRadius: 12, padding: 12, marginTop: 8 },
  optionSelected: { backgroundColor: '#EAF1FF', borderColor: '#2D6CDF' },
  optionLetter: { color: '#2D6CDF', fontWeight: '900', marginRight: 8 },
  optionLetterSelected: { color: '#1D4ED8' },
  optionText: { color: '#2D4159', fontWeight: '600', flex: 1, lineHeight: 21 },
  optionTextSelected: { color: '#1D4ED8' },
  navRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  primaryButton: { flex: 1, backgroundColor: '#2D6CDF', borderRadius: 14, padding: 15, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  secondaryButton: { flex: 1, backgroundColor: '#F3EDDD', borderRadius: 14, padding: 15, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#2D4159', fontWeight: '800', fontSize: 15 },
  disabledButton: { opacity: 0.4 },
  transitionHint: { color: '#1D4ED8', fontWeight: '800', textAlign: 'center', marginTop: 10, fontSize: 12 },
  completeEmoji: { fontSize: 58, marginBottom: 12 },
});
