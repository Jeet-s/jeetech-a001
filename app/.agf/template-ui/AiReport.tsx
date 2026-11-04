import { useState } from "react";
import { Text, View } from "react-native";
import { Sheet, toast } from "./Overlays";
import { Button } from "./Button";
import { Tappable } from "./Pressable";
import { palette, space, type } from "./theme";
import { ai } from "../modules/ai";

const REASONS = [
  { id: "offensive", label: "Offensive or inappropriate" },
  { id: "harmful", label: "Harmful or unsafe advice" },
  { id: "inaccurate", label: "Wrong or misleading" },
  { id: "other", label: "Something else" },
] as const;

/**
 * "Report this AI response" — required by Google Play under every AI-generated response (AI-generated content
 * policy). Place it directly below each AI result: <AiReport feature="meal_photo" />.
 */
export function AiReport({ feature }: { feature: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ alignItems: "flex-start", marginTop: space.xs }}>
      <Tappable onPress={() => setOpen(true)} label="Report this AI response" style={{ paddingVertical: space.xs, minHeight: 40, justifyContent: "center" }}>
        <Text style={[type.caption, { color: palette.inkSoft, textDecorationLine: "underline" }]}>Report this AI response</Text>
      </Tappable>
      <Sheet visible={open} title="Report this AI response" onClose={() => setOpen(false)}>
        <Text style={[type.body, { color: palette.inkSoft, marginBottom: space.md }]}>
          AI can make mistakes. Tell us what was wrong — it helps us make it safer.
        </Text>
        {REASONS.map((r) => (
          <Button
            key={r.id}
            label={r.label}
            variant="secondary"
            style={{ marginBottom: space.sm }}
            onPress={() => {
              ai.reportAiOutput(feature, r.id);
              setOpen(false);
              toast("Thanks — reported to the developer.");
            }}
          />
        ))}
      </Sheet>
    </View>
  );
}
