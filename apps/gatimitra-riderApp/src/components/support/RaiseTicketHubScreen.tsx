// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { SupportScreenHeader } from "@/src/components/support/SupportScreenHeader";
import { RaiseTicketCategoryCard } from "@/src/components/support/RaiseTicketCategoryCard";
import {
  SupportIssueOptionList,
  type SupportIssueOption,
} from "@/src/components/support/SupportIssueOptionList";
import {
  findPreLoginHelpGroup,
  gradientForHelpGroup,
  iconForHelpGroup,
  isPreLoginVisibleTopic,
} from "@/src/lib/rider-support-utils";
import { openRaiseTicketChat } from "@/src/lib/rider-support-navigation";
import { riderSupportService } from "@/src/services/riderSupport.service";
import { useSessionStore } from "@/src/stores/sessionStore";
import { colors } from "@/src/theme";

const TEAL = colors.primary[600];

function isPreLoginParam(raw: string | string[] | undefined): boolean {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "1" || v === "true";
}

/** Hub — lists ticket_groups from API (same source as merchant Contact Us / dashboard Help tree). */
export function RaiseTicketHubScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ prelogin?: string }>();
  const hasSession = useSessionStore((s) => !!s.session?.accessToken);
  const isPreLoginHub = isPreLoginParam(params.prelogin) || !hasSession;

  const groupsQ = useQuery({
    queryKey: ["rider-help-groups"],
    queryFn: () => riderSupportService.getHelpGroups(),
    staleTime: 60_000,
  });

  const groups = groupsQ.data ?? [];
  const preLoginGroup = useMemo(
    () => (isPreLoginHub ? findPreLoginHelpGroup(groups) : null),
    [isPreLoginHub, groups],
  );

  const preLoginTopicsQ = useQuery({
    queryKey: [
      "rider-help-sections",
      "pre-login",
      preLoginGroup?.group_code ?? "all-non-order",
    ],
    queryFn: () =>
      riderSupportService.getHelpSections({
        ...(preLoginGroup?.group_code ? { group_code: preLoginGroup.group_code } : {}),
        intake_only: true,
        all_in_group: true,
      }),
    enabled: isPreLoginHub && !groupsQ.isLoading,
    staleTime: 60_000,
  });

  const preLoginTopics = useMemo(() => {
    const sections = preLoginTopicsQ.data ?? [];
    const visible = sections.filter((s) => isPreLoginVisibleTopic(s, groups));
    if (visible.length > 0) return visible;

    if (!preLoginGroup?.group_code) return visible;

    return sections.filter(
      (s) =>
        !s.has_children &&
        s.group_code === preLoginGroup.group_code &&
        isPreLoginVisibleTopic(s, groups),
    );
  }, [preLoginTopicsQ.data, groups, preLoginGroup?.group_code]);

  const openGroup = (g: (typeof groups)[number]) => {
    router.push({
      pathname: "/raise-ticket-flow",
      params: {
        group_code: g.group_code,
        group_name: g.group_name,
        ...(g.ticket_category ? { ticket_category: g.ticket_category } : {}),
      },
    });
  };

  const postLoginGroups = groups.filter((g) => g.group_code && g.group_code !== "__UNGROUPED__");

  const preLoginTopicItems: SupportIssueOption[] = preLoginTopics.map((s) => ({
    key: String(s.ticket_title_id),
    label: s.title_text ?? s.title_code ?? "Issue",
    subtitle: s.subtext ?? undefined,
    icon: "document-text-outline",
    gradient: ["#0D9488", "#14B8A6"] as const,
  }));

  const loading = isPreLoginHub
    ? groupsQ.isLoading || preLoginTopicsQ.isLoading
    : groupsQ.isLoading;

  const onRefresh = () => {
    void groupsQ.refetch();
    if (isPreLoginHub) void preLoginTopicsQ.refetch();
  };

  const groupCodeForChat = preLoginGroup?.group_code ?? preLoginTopics[0]?.group_code ?? null;

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <SupportScreenHeader
        title={t("profile.supportHub.screenTitle", "Raise a Ticket")}
        subtitle={t("profile.supportHub.screenSubtitle", "Tell us what you need help with")}
        variant="premium"
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={
              (groupsQ.isFetching && !groupsQ.isLoading) ||
              (preLoginTopicsQ.isFetching && !preLoginTopicsQ.isLoading)
            }
            onRefresh={onRefresh}
            tintColor={TEAL}
          />
        }
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={TEAL} />
            <Text style={styles.loadingText}>
              {t("profile.supportHub.loadingTopics", "Loading help topics…")}
            </Text>
          </View>
        ) : isPreLoginHub ? (
          preLoginTopicItems.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                {groupsQ.isError || preLoginTopicsQ.isError
                  ? t(
                      "profile.supportHub.loadTopicsFailed",
                      "Could not refresh topics. Pull to try again.",
                    )
                  : t(
                      "profile.supportHub.noGroups",
                      "No help topics published yet. Please try again later.",
                    )}
              </Text>
            </View>
          ) : (
            <SupportIssueOptionList
              items={preLoginTopicItems}
              onSelect={(key) => {
                const hit = preLoginTopics.find((s) => String(s.ticket_title_id) === key);
                if (hit) {
                  openRaiseTicketChat(hit, hit.group_code ?? groupCodeForChat, null, {
                    prelogin: isPreLoginHub,
                  });
                }
              }}
            />
          )
        ) : postLoginGroups.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>
              {t(
                "profile.supportHub.noGroups",
                "No help topics published yet. Please try again later.",
              )}
            </Text>
          </View>
        ) : (
          <View style={styles.categoryList}>
            {postLoginGroups.map((g, index) => (
              <RaiseTicketCategoryCard
                key={g.group_code}
                title={g.group_name}
                description={
                  g.group_description?.trim() ||
                  t("profile.supportHub.tapToContinue", "Tap to choose your issue")
                }
                icon={iconForHelpGroup(g)}
                gradient={gradientForHelpGroup(g, index)}
                onPress={() => openGroup(g)}
              />
            ))}
          </View>
        )}

        {!loading && (groupsQ.isError || preLoginTopicsQ.isError) && !isPreLoginHub ? (
          <Text style={styles.errorHint}>
            {t(
              "profile.supportHub.loadTopicsFailed",
              "Could not refresh topics. Pull to try again.",
            )}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F1F5F9" },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
    flexGrow: 1,
  },
  categoryList: {
    gap: 14,
    paddingBottom: 8,
  },
  center: { paddingVertical: 48, alignItems: "center", gap: 12 },
  loadingText: { fontSize: 14, color: "#64748B" },
  emptyText: { fontSize: 14, color: "#64748B", textAlign: "center", paddingHorizontal: 24 },
  errorHint: {
    marginTop: 8,
    fontSize: 12,
    color: "#B45309",
    textAlign: "center",
  },
});
