import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { EnvironmentId } from "@t3tools/contracts";
import {
  buildBoardViewModel,
  type BoardCardViewModel,
  type BoardColumnViewModel,
  type BoardViewModel,
} from "@t3tools/client-runtime/state/todo-board-view";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Markdown } from "react-native-nitro-markdown";

import { AppText as Text } from "../../components/AppText";
import { AndroidScreenHeader } from "../../components/AndroidScreenHeader";
import { EmptyState } from "../../components/EmptyState";
import { LoadingScreen } from "../../components/LoadingScreen";
import { cn } from "../../lib/cn";
import { tryOpenExternalUrl } from "../../lib/openExternalUrl";
import {
  hasNativeSelectableMarkdownText,
  SelectableMarkdownText,
} from "../../native/SelectableMarkdownText";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { useMarkdownPreviewStyles } from "../files/FileMarkdownPreview";
import { todoBoard } from "../../state/todoBoard";
import { boardFailureMessage, classifyBoardFailure } from "./boardStatus";

type BoardRouteScreenProps = StaticScreenProps<{
  readonly environmentId: string;
  readonly cwd: string;
  readonly projectName?: string;
}>;

export function BoardRouteScreen(props: BoardRouteScreenProps) {
  const navigation = useNavigation();
  const { environmentId: routeEnvironmentId, cwd, projectName } = props.route.params;
  const environmentId = EnvironmentId.make(routeEnvironmentId);
  const title = projectName !== undefined && projectName.length > 0 ? projectName : "Board";
  const boardAtom = useMemo(
    () => todoBoard.subscribe({ environmentId, input: { cwd } }),
    [environmentId, cwd],
  );
  const boardResult = useAtomValue(boardAtom);
  const refreshBoard = useAtomRefresh(boardAtom);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);

  const failure = boardResult._tag === "Failure" ? boardResult.cause : null;
  const snapshot = boardResult._tag === "Success" ? boardResult.value : null;
  const viewModel = useMemo(
    () =>
      snapshot === null
        ? null
        : buildBoardViewModel(snapshot, { tag: null, sort: "updated-desc" as const }),
    [snapshot],
  );
  const selectedCard =
    viewModel === null || selectedIssueId === null
      ? null
      : (viewModel.columns
          .flatMap((column) => column.cards)
          .find((card) => card.issue.id === selectedIssueId) ?? null);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation]);
  const handleDeselect = useCallback(() => setSelectedIssueId(null), []);

  const headerSubtitle = snapshot?.root ?? null;

  let body: ReactNode;
  if (failure !== null && snapshot === null) {
    body =
      classifyBoardFailure(failure) === "board_not_found" ? (
        <View className="flex-1 items-center justify-center px-6">
          <EmptyState title="No .todo board resolves here." detail={cwd} />
        </View>
      ) : (
        <View className="flex-1 items-center justify-center px-6">
          <EmptyState
            title="Board unavailable"
            detail={boardFailureMessage(failure)}
            actionLabel="Retry"
            onAction={refreshBoard}
          />
        </View>
      );
  } else if (viewModel === null) {
    body = <LoadingScreen message="Loading board..." messagePlacement="above-spinner" />;
  } else {
    body = (
      <BoardSurface
        viewModel={viewModel}
        selectedCard={selectedCard}
        onSelect={setSelectedIssueId}
        onDeselect={handleDeselect}
      />
    );
  }

  return (
    <View className="flex-1 bg-screen">
      <NativeStackScreenOptions
        options={{
          title,
          ...(Platform.OS === "ios" && headerSubtitle !== null
            ? { unstable_headerSubtitle: headerSubtitle }
            : {}),
        }}
      />
      {Platform.OS === "android" ? (
        <AndroidScreenHeader
          title={title}
          subtitle={headerSubtitle}
          hideBottomBorder
          onBack={handleBack}
        />
      ) : null}
      {body}
    </View>
  );
}

function BoardSurface(props: {
  readonly viewModel: BoardViewModel;
  readonly selectedCard: BoardCardViewModel | null;
  readonly onSelect: (issueId: string) => void;
  readonly onDeselect: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          paddingRight: 32,
          gap: 12,
        }}
      >
        {props.viewModel.columns.map((column) => (
          <BoardColumn
            key={column.status}
            column={column}
            selectedIssueId={props.selectedCard?.issue.id ?? null}
            onSelect={props.onSelect}
          />
        ))}
      </ScrollView>
      {props.selectedCard !== null ? (
        <BoardDetail
          card={props.selectedCard}
          onClose={props.onDeselect}
          bottomInset={insets.bottom}
        />
      ) : null}
    </View>
  );
}

function BoardColumn(props: {
  readonly column: BoardColumnViewModel;
  readonly selectedIssueId: string | null;
  readonly onSelect: (issueId: string) => void;
}) {
  return (
    <View className="w-72 gap-2">
      <View className="flex-row items-center gap-2 px-1">
        <Text className="flex-1 text-sm font-t3-bold text-foreground-muted">
          {props.column.label}
        </Text>
        <Text className="text-sm text-foreground-tertiary">{props.column.cards.length}</Text>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
      >
        {props.column.cards.map((card) => (
          <BoardCard
            key={card.issue.id}
            card={card}
            selected={card.issue.id === props.selectedIssueId}
            onPress={() => props.onSelect(card.issue.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function BoardCard(props: {
  readonly card: BoardCardViewModel;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const { card } = props;
  const tint =
    card.tinted && card.hue !== null
      ? { backgroundColor: `hsla(${card.hue}, 65%, 50%, 0.14)` }
      : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${card.issue.title}, ${card.statusLabel}`}
      onPress={props.onPress}
      className={cn(
        "rounded-xl border bg-card p-3",
        props.selected ? "border-primary" : "border-border",
      )}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, ...tint })}
    >
      <View className="flex-row items-start gap-2">
        <Text
          className="min-w-0 flex-1 text-sm font-t3-medium leading-snug text-foreground"
          numberOfLines={3}
        >
          {card.issue.title}
        </Text>
        {card.badge !== null ? (
          <Text
            className={cn(
              "rounded-full px-1.5 text-[10px] font-t3-bold leading-4",
              card.badge === "human" ? "bg-danger text-white" : "bg-warning text-foreground",
            )}
          >
            ?
          </Text>
        ) : null}
        <Text aria-label={card.statusLabel} className="text-sm leading-4 text-foreground-muted">
          {card.glyph}
        </Text>
      </View>
      {card.blockedBy.length > 0 ? (
        <Text className="mt-1 text-xs text-foreground-tertiary" numberOfLines={1}>
          blocked by {card.blockedBy.map((blocker) => blocker.title).join(", ")}
        </Text>
      ) : null}
    </Pressable>
  );
}

function BoardDetail(props: {
  readonly card: BoardCardViewModel;
  readonly onClose: () => void;
  readonly bottomInset: number;
}) {
  const { card } = props;
  const styles = useMarkdownPreviewStyles();
  const onLinkPress = useCallback((href: string) => {
    void tryOpenExternalUrl(href, "markdown-link");
  }, []);
  return (
    <View
      className="max-h-[45%] border-t border-border bg-card"
      style={{ paddingBottom: Math.max(props.bottomInset, 12) }}
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        <View className="flex-row items-start gap-2">
          <Text className="min-w-0 flex-1 text-base font-t3-bold text-foreground" numberOfLines={2}>
            {card.issue.title}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close issue details"
            hitSlop={8}
            onPress={props.onClose}
          >
            <Text className="text-sm text-foreground-muted">Close</Text>
          </Pressable>
        </View>
        <Text className="text-sm text-foreground-muted">
          {card.glyph} {card.statusLabel}
        </Text>
        {card.issue.tags.length > 0 ? (
          <Text className="text-sm text-foreground-muted">Tags: {card.issue.tags.join(", ")}</Text>
        ) : null}
        {card.parent !== null ? (
          <Text className="text-sm text-foreground-muted">Part of: {card.parent.title}</Text>
        ) : null}
        {card.blockedBy.map((blocker) => (
          <Text key={blocker.id} className="text-sm text-foreground-muted">
            Blocked by: {blocker.title}
          </Text>
        ))}
        {card.issue.body.length > 0 ? (
          hasNativeSelectableMarkdownText() ? (
            <SelectableMarkdownText
              markdown={card.issue.body}
              textStyle={styles.nativeTextStyle}
              onLinkPress={onLinkPress}
            />
          ) : (
            <Markdown
              options={{ gfm: true }}
              renderers={styles.renderers}
              styles={styles.styles}
              theme={styles.theme}
            >
              {card.issue.body}
            </Markdown>
          )
        ) : null}
      </ScrollView>
    </View>
  );
}
