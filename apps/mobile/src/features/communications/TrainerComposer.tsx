import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useBrand } from '@/brand/BrandProvider';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';

interface AnnouncementFormProps {
  initialTitle?: string;
  initialBody?: string;
  locked?: boolean;
  onSaveDraft: (input: { title: string; body: string }) => void;
  onPublish: (input: { title: string; body: string }) => void;
  saving?: boolean;
}

export function AnnouncementForm({
  initialTitle = '',
  initialBody = '',
  locked = false,
  onSaveDraft,
  onPublish,
  saving = false,
}: AnnouncementFormProps) {
  const { colors, fontFamily } = useBrand();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const input = { title: title.trim(), body: body.trim() };
  const ready = input.title.length > 0 && input.body.length > 0 && !locked;

  return (
    <View style={styles.form}>
      <Field
        testID="announcement-title"
        label="Título"
        value={title}
        onChangeText={setTitle}
        editable={!locked}
        maxLength={120}
      />
      <Field
        testID="announcement-body"
        label="Contenido"
        value={body}
        onChangeText={setBody}
        editable={!locked}
        multiline
        maxLength={4000}
        style={styles.body}
      />
      {locked ? (
        <Text style={{ color: colors.textMuted, fontFamily: fontFamily?.regular }}>
          Este aviso ya fue publicado. Podés archivarlo, no editarlo.
        </Text>
      ) : (
        <View style={styles.actions}>
          <Button
            label="Guardar borrador"
            variant="secondary"
            disabled={!ready}
            loading={saving}
            onPress={() => onSaveDraft(input)}
          />
          <Button
            label="Publicar"
            disabled={!ready}
            loading={saving}
            onPress={() => onPublish(input)}
          />
        </View>
      )}
    </View>
  );
}

export interface MessageStudentOption {
  id: string;
  name: string;
}

interface MessageComposerProps {
  students: MessageStudentOption[];
  onSend: (input: { membershipId: string; body: string }) => void;
  sending?: boolean;
}

export function MessageComposer({ students, onSend, sending = false }: MessageComposerProps) {
  const { colors, layout, fontFamily } = useBrand();
  const [membershipId, setMembershipId] = useState(students[0]?.id ?? '');
  const [body, setBody] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const selected = students.find((student) => student.id === membershipId) ?? null;
  const ready = Boolean(selected) && body.trim().length > 0;

  if (reviewing && selected) {
    return (
      <View style={styles.form} testID="message-review">
        <Text style={{ color: colors.text, fontFamily: fontFamily?.bold, fontWeight: '700' }}>
          Para {selected.name}
        </Text>
        <Text testID="message-review-body" style={{ color: colors.text, fontSize: 16 }}>
          {body.trim()}
        </Text>
        <Text style={{ color: colors.textMuted }}>
          El alumno no puede responder dentro de la app.
        </Text>
        <Button
          label="Enviar"
          loading={sending}
          onPress={() => onSend({ membershipId: selected.id, body: body.trim() })}
        />
        <Button label="Volver a editar" variant="secondary" onPress={() => setReviewing(false)} />
      </View>
    );
  }

  return (
    <View style={styles.form}>
      <Text style={{ color: colors.text, fontFamily: fontFamily?.bold }}>Alumno</Text>
      <View style={{ gap: 8 }}>
        {students.map((student) => {
          const active = student.id === membershipId;
          return (
            <Pressable
              key={student.id}
              accessibilityRole="button"
              onPress={() => setMembershipId(student.id)}
              style={{
                borderColor: active ? colors.primary : colors.border,
                borderWidth: layout?.cardBorderWidth ?? 1,
                borderRadius: layout?.radiusMd ?? 10,
                padding: 12,
                backgroundColor: colors.surface,
              }}
            >
              <Text style={{ color: colors.text }}>{student.name}</Text>
            </Pressable>
          );
        })}
      </View>
      <Field
        testID="message-body"
        label="Mensaje"
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={2000}
        style={styles.body}
      />
      <Button label="Revisar" disabled={!ready} onPress={() => setReviewing(true)} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  body: { minHeight: 120, textAlignVertical: 'top' },
  actions: { gap: 12 },
});
