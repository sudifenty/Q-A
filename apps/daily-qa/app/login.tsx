import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const signIn = async () => {
    if (!isSupabaseConfigured) {
      setError('Connect this app to the shared Supabase project first. Copy the project URL and publishable/anon key into apps/daily-qa/.env.');
      return;
    }
    if (!email.trim() || !password) {
      setError('Enter your existing student email and password.');
      return;
    }
    setBusy(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    setBusy(false);
    if (authError) setError(authError.message);
  };

  return (
    <KeyboardAvoidingView style={s.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <View style={s.card}>
        <View style={s.logo}><Text style={s.logoText}>Q&amp;A</Text></View>
        <Text style={s.eyebrow}>SMARTPLE · DAILY REVISION</Text>
        <Text style={s.title}>Welcome back</Text>
        <Text style={s.subtitle}>Sign in with the student account you already use for SmartPle.</Text>
        <TextInput
          style={s.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Student email"
          placeholderTextColor="#9AA69F"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          accessibilityLabel="Student email"
        />
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#9AA69F"
          secureTextEntry
          textContentType="password"
          accessibilityLabel="Password"
          onSubmitEditing={signIn}
        />
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        <Pressable style={[s.button, busy && s.buttonBusy]} onPress={signIn} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Sign in to study</Text>}
        </Pressable>
        <Text style={s.help}>Need an account? Ask your admin to create or enable your student account.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: '#F7F8F3' },
  card: { width: '100%', maxWidth: 440, alignSelf: 'center', borderRadius: 24, padding: 24, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E4EBE3', shadowColor: '#193B29', shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 3 },
  logo: { width: 58, height: 58, borderRadius: 18, backgroundColor: '#287A55', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  logoText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: -0.5 },
  eyebrow: { color: '#287A55', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title: { marginTop: 8, color: '#20342A', fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  subtitle: { marginTop: 8, marginBottom: 21, color: '#748178', fontSize: 14, lineHeight: 21 },
  input: { borderWidth: 1, borderColor: '#E1E9E0', borderRadius: 13, paddingHorizontal: 14, paddingVertical: 13, color: '#24382C', fontSize: 15, marginBottom: 11, backgroundColor: '#FCFDFC' },
  error: { color: '#A83434', backgroundColor: '#FFF0EE', borderRadius: 10, padding: 11, lineHeight: 18, fontSize: 12, marginBottom: 11 },
  button: { height: 49, alignItems: 'center', justifyContent: 'center', backgroundColor: '#287A55', borderRadius: 13, marginTop: 4 },
  buttonBusy: { opacity: 0.75 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  help: { marginTop: 16, color: '#89958D', textAlign: 'center', fontSize: 11, lineHeight: 17 }
});
