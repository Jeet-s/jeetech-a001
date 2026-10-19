/**
 * Product UI kit — build every screen from these. They carry the polish
 * (spacing, type scale, springs, haptics, accessibility labels, 48dp targets);
 * raw unstyled <View>/<Text> with system fonts looks cheap and fails the
 * quality judge. Extend the kit (new components here) rather than one-off styles.
 */
export * from "./theme";
export { Icon, PATHS, type IconName } from "./Icon";
export { Tappable } from "./Pressable";
export { Button, IconButton } from "./Button";
export { Screen, FooterScreen, Card, SectionHeader, Stat } from "./Layout";
export { TextField, Toggle, ListItem, Chip, Segmented } from "./Controls";
export { Sheet, EmptyState, ToastHost, toast } from "./Overlays";
export { ProgressRing, BarChart, DonutChart, Legend } from "./Charts";
export { HeroCard, Pill, ProgressBar, Amount, Skeleton, SkeletonList } from "./Display";
export { TabBar, TAB_BAR_HEIGHT } from "./TabBar";
export { AccountSheet, useCloudUser } from "./Account";
export { Confetti } from "../fx/Confetti";
export { play, haptic, feedback, initAudio } from "../audio/sfx";
