import {
  isBoardFilterActive,
  isQuickFilterActive,
  type BoardEpicQuickFilter,
} from "@t3tools/client-runtime/state/todo-board-view";
import { Pressable, ScrollView, View } from "react-native";

import { AppText as Text, AppTextInput } from "../../components/AppText";
import { cn } from "../../lib/cn";

export interface BoardFilterState {
  readonly tagSpec: string;
  readonly query: string;
}

export const EMPTY_BOARD_FILTER_STATE: BoardFilterState = { tagSpec: "", query: "" };

export function BoardFilterStrip(props: {
  readonly epics: ReadonlyArray<BoardEpicQuickFilter>;
  readonly commonTags: ReadonlyArray<string>;
  readonly filter: BoardFilterState;
  readonly onQueryChange: (query: string) => void;
  readonly onToggleTerm: (term: string) => void;
  readonly onClear: () => void;
}) {
  const { filter } = props;
  const hasChips = props.epics.length > 0 || props.commonTags.length > 0;
  return (
    <View className="gap-2 border-b border-border bg-screen px-4 py-3">
      <View className="flex-row items-center gap-2">
        <AppTextInput
          className="min-h-0 flex-1 px-3 py-2"
          placeholder="Filter by tag or short id"
          accessibilityLabel="Filter issues by text"
          value={filter.query}
          onChangeText={props.onQueryChange}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {isBoardFilterActive(filter) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear all board filters"
            onPress={props.onClear}
            className="rounded-full border border-border px-3 py-2 active:opacity-70"
          >
            <Text className="text-sm text-foreground-muted">Clear</Text>
          </Pressable>
        ) : null}
      </View>
      {hasChips ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 6 }}
        >
          {props.epics.map((epicFilter) => (
            <BoardFilterChip
              key={`epic-${epicFilter.epic}`}
              label={epicFilter.epic}
              hue={epicFilter.hue}
              active={isQuickFilterActive(epicFilter.epic, filter)}
              onPress={() => props.onToggleTerm(epicFilter.epic)}
            />
          ))}
          {props.commonTags.map((tag) => (
            <BoardFilterChip
              key={`tag-${tag}`}
              label={tag}
              hue={null}
              active={isQuickFilterActive(tag, filter)}
              onPress={() => props.onToggleTerm(tag)}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function BoardFilterChip(props: {
  readonly label: string;
  readonly hue: number | null;
  readonly active: boolean;
  readonly onPress: () => void;
}) {
  const tint =
    props.hue === null ? undefined : { backgroundColor: `hsla(${props.hue}, 65%, 50%, 0.14)` };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.active }}
      onPress={props.onPress}
      className={cn(
        "rounded-full border px-3 py-1.5",
        props.hue === null ? "border-border bg-card" : "border-border",
        props.active && "border-primary",
      )}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, ...tint })}
    >
      <Text className="text-xs font-t3-medium text-foreground-muted">{props.label}</Text>
    </Pressable>
  );
}
