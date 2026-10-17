import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [klass, setKlass] = useState('P6');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const { error, data } = mode === 'signup'
      ? await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name, class_level: klass } }
        })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return Alert.alert('Hmm', error.message);
    if (mode === 'signup' && !data.session)
      return Alert.alert('Account created', 'Check your email to confirm, then sign in.');
  };

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Text style={s.logo}>📚</Text>
      <Text style={s.title}>SmartPle</Text>
      <Text style={s.sub}>{mode === 'signup' ? 'Create your learner account' : 'Welcome back'}</Text>
      {mode === 'signup' && (
        <>
          <TextInput style={s.input} placeholder="Your name" value={name} onChangeText={setName} />
          <View style={s.row}>
            {['P4', 'P5', 'P6', 'P7'].map(c => (
              <Pressable key={c} onPress={() => setKlass(c)}
                style={[s.chip, klass === c && s.chipOn]}>
                <Text style={klass === c ? s.chipOnT : s.chipT}>{c}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      <TextInput style={s.input} placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder="Password (6+ characters)" secureTextEntry value={password} onChangeText={setPassword} />
      <Pressable style={[s.btn, busy && { opacity: 0.5 }]} disabled={busy} onPress={submit}>
        <Text style={s.btnT}>{busy ? '…' : mode === 'signup' ? 'CREATE ACCOUNT' : 'SIGN IN'}</Text>
      </Pressable>
      <Pressable onPress={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
        <Text style={s.switch}>{mode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Create one'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: { fontSize: 52, textAlign: 'center' },
  title: { fontSize: 30, fontWeight: '900', textAlign: 'center', color: '#2D4159' },
  sub: { textAlign: 'center', color: '#8A7F6A', marginBottom: 18, marginTop: 4 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E6DCC8', borderRadius: 14, padding: 14, marginBottom: 10, fontSize: 16 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E6DCC8' },
  chipOn: { backgroundColor: '#2D6CDF', borderColor: '#2D6CDF' },
  chipT: { color: '#2D4159', fontWeight: '700' },
  chipOnT: { color: '#fff', fontWeight: '700' },
  btn: { backgroundColor: '#2D6CDF', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 6 },
  btnT: { color: '#fff', fontWeight: '900', fontSize: 16 },
  switch: { textAlign: 'center', color: '#2D6CDF', fontWeight: '700', marginTop: 14 }
});
