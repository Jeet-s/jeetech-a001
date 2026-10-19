import { useEffect, useState } from "react";
import { Alert, Linking, Text, View } from "react-native";
import { Sheet, toast } from "./Overlays";
import { Button } from "./Button";
import { TextField } from "./Controls";
import { feedback } from "../audio/sfx";
import { palette, space, type } from "./theme";
import { cloud, CloudFailure, type CloudUser } from "../modules/cloud";
import { analytics } from "../modules/analytics";

/** Current cloud user (null = never used the cloud on this device). */
export function useCloudUser(): CloudUser | null {
  const [u, setU] = useState<CloudUser | null>(null);
  useEffect(() => {
    cloud.user().then(setU);
    return cloud.subscribe(setU);
  }, []);
  return u;
}

/**
 * Account sheet for apps with cloud saving / AI: sign in with a one-time email
 * code (keeps data across phones), sign out, and delete account (required by
 * Google Play whenever an app lets people create an account). `onSignedIn` runs
 * after sign-in — pull/merge the user's cloud data there.
 */
export function AccountSheet({
  visible,
  onClose,
  onSignedIn,
}: {
  visible: boolean;
  onClose: () => void;
  onSignedIn?: (r: { switched: boolean }) => void;
}) {
  const user = useCloudUser();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = !!user && !user.anonymous;

  useEffect(() => {
    if (!visible) {
      setStep("email");
      setCode("");
      setError(null);
    }
  }, [visible]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      feedback("error", "error");
      setError(e instanceof CloudFailure && e.code === "offline" ? "You're offline — try again when connected." : e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} title={signedIn ? "Your account" : "Keep your data safe"} onClose={onClose}>
      {signedIn ? (
        <View style={{ gap: space.md }}>
          <Text style={type.body}>
            Signed in as <Text style={type.bodyStrong}>{user!.email}</Text>. Your data is backed up and available when you sign in on another phone.
          </Text>
          <Button label="Sign out" variant="secondary" onPress={() => run(async () => { await cloud.signOut(); toast("Signed out"); onClose(); })} />
          <Button
            label="Delete account"
            variant="danger"
            icon="trash"
            onPress={() =>
              Alert.alert("Delete account?", "This permanently deletes your account and everything saved in the cloud. Data on this phone stays until you delete it in Settings.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => run(async () => { await cloud.deleteAccount(); analytics.track("account_deleted"); toast("Account deleted"); onClose(); }),
                },
              ])
            }
          />
        </View>
      ) : step === "email" ? (
        <View style={{ gap: space.md }}>
          <Text style={[type.body, { color: palette.inkSoft }]}>
            Sign in with your email to back up your data and use it on another phone. No password — we email you a code.
          </Text>
          <TextField label="Email" placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" value={email} onChangeText={setEmail} error={error} />
          <Button
            label="Send code"
            size="lg"
            loading={busy}
            disabled={!/^\S+@\S+\.\S+$/.test(email)}
            onPress={() => run(async () => { await cloud.signIn(email); setStep("code"); })}
          />
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          <Text style={type.body}>Enter the 6-digit code we sent to {email}.</Text>
          <TextField label="Code" placeholder="123456" keyboardType="number-pad" maxLength={8} value={code} onChangeText={setCode} error={error} autoFocus />
          <Button
            label="Sign in"
            size="lg"
            loading={busy}
            disabled={code.replace(/\D/g, "").length < 6}
            onPress={() =>
              run(async () => {
                const r = await cloud.verifyCode(code);
                feedback("success", "success");
                analytics.track("signed_in", { switched: r.switched });
                toast("Signed in — your data is backed up");
                onSignedIn?.(r);
                onClose();
              })
            }
          />
          <Button label="Use a different email" variant="ghost" sound={null} onPress={() => setStep("email")} style={{ borderWidth: 0 }} />
        </View>
      )}
      {cloud.deleteAccountUrl ? (
        <Text style={[type.caption, { textAlign: "center" }]} onPress={() => Linking.openURL(cloud.deleteAccountUrl)} accessibilityRole="link">
          Delete your account from the web
        </Text>
      ) : null}
    </Sheet>
  );
}
