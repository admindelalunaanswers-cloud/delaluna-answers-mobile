# Analytics

How Delaluna Answers measures which screens and features people use: what is
collected, where it is sent from, how to add more, and how to read it back.

- **Tool:** Firebase Analytics (GA4), through `@react-native-firebase/analytics`.
- **Code:** everything goes through [`src/services/analytics.service.ts`](../src/services/analytics.service.ts).
  Nothing else in `app/` or `src/` imports the Firebase analytics SDK directly.
- **Where to look:** Firebase console → Analytics, or the linked GA4 property.
  For anything the standard reports can't answer, use the BigQuery export
  ([Reading the data](#reading-the-data)).

## Contents

- [What gets collected](#what-gets-collected)
- [Screen views](#screen-views)
- [In-screen interactions: `ui_interaction`](#in-screen-interactions-ui_interaction)
- [Event catalog](#event-catalog)
- [Privacy rules](#privacy-rules)
- [Adding tracking](#adding-tracking)
- [Console setup](#console-setup)
- [Testing and verifying](#testing-and-verifying)
- [Reading the data](#reading-the-data)
- [Known gaps](#known-gaps)

## What gets collected

There are three layers, from broadest to most specific:

| Layer | Event | Answers |
|---|---|---|
| Screens | `screen_view` | Which screens get opened, how often, and for how long |
| Interactions | `ui_interaction` | What people do *inside* a screen: tabs, cards, toggles, buttons |
| Outcomes | Named events (`horoscope_viewed`, `chat_message_sent`, …) | Things worth counting or putting in a funnel by themselves |

GA4 also collects its own automatic events (`first_open`, `session_start`,
`user_engagement`, `app_update`, and so on). `user_engagement` carries
engagement time per screen, which is where the time-on-screen figures in the
Pages and screens report come from.

**Production only.** When the module loads, `analytics.service.ts` calls
`setAnalyticsCollectionEnabled(getAnalytics(), isProduction)`.
Development and preview builds still run every tracking call, but the SDK
uploads nothing. The setting persists on the device, so installing a dev build
over a store build switches reporting off for that device as well.

**Identity.** `app/_layout.tsx` sets the GA4 `user_id` to the Firebase Auth uid
and clears it on sign-out. Every event is also tagged with an `app_environment`
user property.

## Screen views

`app/_layout.tsx` logs one `screen_view` per route change. It is the only place
that does; screens never log their own.

- `screen_name` is a readable label from `ROUTE_LABELS` in `analytics.service.ts`.
- `screen_class` is the route **template**, for example `/connection/[id]`.

Labels are keyed on `routeKeyForSegments(useSegments())`, not on `usePathname()`.
The pathname drops group segments (`/chat` rather than `/(main)/chat`) and
contains concrete ids (`/connection/abc123`). Keying on it would split every
connection into its own screen and send connection ids to GA4.

| Route template | `screen_name` |
|---|---|
| `/(main)` | Home |
| `/(main)/transits` | Transits |
| `/(main)/chat` | Chat |
| `/(main)/connections` | Connections |
| `/(home)/birth-chart-view` | Birth Chart |
| `/connection/new` | New Connection |
| `/connection/[id]` | Connection Report |
| `/connection/[id]/edit` | Edit Connection |
| `/connection/[id]/synastry` | Synastry |
| `/(settings)/…` | Profile, Edit Profile, Paywall, Accessibility, Purchased Reports, Select Avatar, Update Password, Update Theme, Admin |
| `/(auth)/…`, `/(startup)/welcome`, `/(util)/…` | Login, Sign Up, Verify Email, Forgot Password, Welcome, Loading, Feedback, Support |

A route with no entry in `ROUTE_LABELS` falls back to a prettified version of
its template, for example `/(settings)/something-new` → "Something New". When
you add a screen, add a label so the report shows a deliberate name.

> `ROUTE_LABELS` also serves `perf-log.service.ts`, which builds its
> `performanceLogs` document slugs from these labels. The `"/(main)/index"`
> entry ("Birth Data Input") is a perf-log key, not a router key, and existing
> performance history is stored under that slug. Don't rename it casually.

## In-screen interactions: `ui_interaction`

Everything a user does inside a screen is logged as **one** event:

```ts
import { trackInteraction } from '@/src/services/analytics.service';

trackInteraction({ screen: 'transits', feature: 'house_card', action: 'expand', item: `house_${n}` });
```

| Param | Type | Meaning |
|---|---|---|
| `screen` | `InteractionScreen`, a fixed union | Where it happened: `home`, `birth_chart`, `transits`, `chat`, `connections`, `connection_report`, `synastry` |
| `feature` | string, normalised | The control: `date_switcher`, `breakdown_tab`, `house_card`… |
| `action` | `InteractionAction` | `tap`, `select`, `expand`, `collapse`, `reveal`, `unlock` |
| `item` | string or number, optional | Which one: `today`, `aspects`, `house_7`… Left out when empty |

`feature` and `item` pass through `toAnalyticsValue()`, which converts them to
snake_case and caps them at 100 characters, GA4's limit for a string value. That
means you can pass a tab's display name (`'Natal Wheel'`) and it arrives as
`natal_wheel`.

**Why one event and not one per control?** GA4 allows 500 distinct event
names per app, and a parameter only appears in reports once it is registered
as a custom dimension (50 event-scoped slots). One event with four registered
dimensions answers "what gets used most" in a single report, broken down
`screen` → `feature` → `item`, and adding a control later needs no console
change.

`unlock` means a user tapped a locked item or an upgrade prompt, and the paywall
follows. Counting `unlock` by `feature` shows which teaser drives the most
paywall opens.

### What is instrumented

| Screen | `feature` | `action` | `item` |
|---|---|---|---|
| `home` | `date_switcher` | `select` | `yesterday` / `today` / `tomorrow` / `other` |
| `home` | `tarot_cards` | `reveal` | relative day |
| `home` | `view_chart` | `tap` | none |
| `home` | `chat_prompt` | `tap` | `new_love`, `returns_1`, `returns_2` |
| `home` | `paygate`, `ad_banner_full`, `ad_banner` | `unlock` | relative day |
| `birth_chart` | `chart_tab` | `select` | `natal_wheel`, `natal_table` |
| `birth_chart` | `breakdown_tab` | `select` | `insights`, `houses`, `planets`, `aspects` |
| `birth_chart` | `breakdown_tab_locked` | `select` | `planets`, `aspects` (free user) |
| `birth_chart` | `premium_unlock` | `unlock` | the locked tab |
| `transits` | `house_card` | `expand` / `collapse` / `unlock` | `house_1` … `house_12` |
| `chat` | `reader_toggle` | `select` | `astrology`, `tarot` |
| `chat` | `reader_switch_limit` | `tap` | `start_new_chat`, `stay` |
| `connections` | `connection_card` | `tap` | none (never the connection id) |
| `connections` | `locked_connection` | `tap` | none |
| `connections` | `add_connection` | `tap` | `header`, `placeholder`, `empty_state` |
| `connections` | `connection_limit` | `tap` | `free`, `premium` (the add hit the limit alert) |
| `connections` | `delete_connection` | `tap` | none (the confirmed delete is `connection_deleted`) |
| `connections` | `paygate`, `limit_alert`, `locked_alert` | `unlock` | none |
| `connection_report` | `synastry` | `tap` / `unlock` | none (`unlock` = a free user got the paywall) |
| `connection_report` | `talk_to_delaluna` | `tap` | none |
| `connection_report` | `edit_connection` | `tap` | none |
| `connection_report` | `score_definition` | `expand` / `collapse` | the `KEYWORD_DEFINITIONS` key, e.g. `interest` |
| `connection_new` | `use_my_chart` | `select` | `on`, `off` |
| `connection_new`, `connection_edit` | `relationship_type` | `select` | `it_s_consistent`, `it_s_complicated`, `i_dunno` |
| `connection_new`, `connection_edit` | `save` | `tap` | none |
| `connection_new`, `connection_edit` | `save_blocked` | `tap` | the missing field, e.g. `second_person_birthday`; or `relationship_type`; or `change_limit` (edit only) |
| `connection_new`, `connection_edit` | `cancel` | `tap` | none |
| `connection_new` | `discard_alert` | `tap` | `discard`, `keep_editing` |
| `connection_edit` | `delete_connection` | `tap` | none (the confirmed delete is `connection_deleted`) |
| `synastry` | `reading_section` | `view` | `key_aspect`, `love_language`, `conflict_style`, `longevity` |

`save_blocked` sends the **name** of the first required field that was empty,
never anything the user typed. Comparing it against `save` shows which field
people get stuck on.

`view` is the one action that isn't a tap. `useSectionsReached`
(`src/hooks/use-sections-reached.ts`) reports each section of a long scroll the
first time at least 80pt of it is on screen, so Synastry's counts are its read
depth. It reports nothing until the reading has loaded, so a section that was
scrolled past while still a skeleton isn't counted. To measure read depth on
another long screen, reuse the hook: put `onLayout(key)` on each section, and
`onScroll` and `onViewportLayout` on the ScrollView.

Re-tapping the tab that is already selected is not logged; the user made no
choice. Dates are always sent relative to today, never as the date itself.

## Event catalog

Named events live in the `Events` object in `analytics.service.ts`. Call them
as `Events.horoscopeViewed({ day: 'today' })`.

### Content viewed

A "viewed" event means the content was actually on screen, not that the route
opened. The gap between one of these and the matching `screen_view` is how
often people reached a screen and saw a loading skeleton or a paygate instead.

| Event | Params | Fired from | When |
|---|---|---|---|
| `horoscope_viewed` | `day` | `app/(main)/index.tsx` | A day's reading is shown and isn't paygated. Once per day per mount |
| `transits_viewed` | none | `app/(main)/transits.tsx` | The reading is shown. Once per mount |
| `natal_breakdown_viewed` | `premium` | `app/(home)/birth-chart-view.tsx` | The breakdown is shown rather than a skeleton. Once per mount |
| `connection_report_viewed` | none | `app/connection/[id]/index.tsx` | The compatibility report is shown rather than the skeleton. Once per mount |
| `connections_list_viewed` | `count` | `app/(main)/connections.tsx` | The list's first server snapshot. `count` is how many connections are saved |
| `synastry_viewed` | `saved` | `app/connection/[id]/synastry.tsx` | A reading is shown. `saved: true` if it already existed, `false` if it was generated for this visit |
| `tarot_drawn` | `source` (`home`/`chat`), `cards` | Home card reveal; chat send in tarot mode | Each draw |

"Once per mount" for a tab screen means roughly once per app session, because
tab screens stay mounted. Use `screen_view` to count visits.

### Core flows

| Event | Params | Fired from |
|---|---|---|
| `sign_up` | `method` | `app/(auth)/sign-up.tsx` |
| `login` | `method` | `app/(auth)/login.tsx` |
| `email_verified` | none | `app/(auth)/verify-email.tsx` |
| `birth_chart_generated` | `has_time` | `app/(auth)/sign-up.tsx` |
| `connection_created` | `first_person` (`me`/`someone_else`), `relationship` | `app/connection/new.tsx` |
| `connection_updated` | `change` (`pronouns_only` / `birth_details` / `details`) | `app/connection/[id]/edit.tsx`. `birth_details` means the report was regenerated |
| `connection_deleted` | none | `src/services/connection.service.ts` |
| `chat_message_sent` | `length`, `mode` (`astrology`/`tarot`) | `app/(main)/chat.tsx` |
| `chat_retry` | none | `app/(main)/chat.tsx` |
| `chat_exported` | `format`, `destination`, `source`, `includeQuestions`, `includeBirthDetails` | `src/components/chat/chat-export-sheet.tsx` |
| `theme_changed` | `theme` | `src/context/theme-context.tsx` |

`length` is the question's character count, never its text.

### Monetization

| Event | Params | Fired from |
|---|---|---|
| `paywall_viewed` | `source` (`manual`/`gated`) | `src/context/revenuecat-context.tsx` |
| `paywall_dismissed` | `source` | `src/context/revenuecat-context.tsx` |
| `purchase_completed` | `product_id`, `price?`, `currency?` | `revenuecat-context.tsx`, `consumable-placeholder.component.tsx` |
| `purchase_failed` | `product_id`, `reason?`, `user_cancelled?` | same |
| `restore_purchases` | `success` | `revenuecat-context.tsx` |
| `purchase_started` | `product_id` | **Not called anywhere.** See [Known gaps](#known-gaps) |

Revenue itself is better read from RevenueCat than from these events.
RevenueCat sees refunds, renewals and sandbox purchases; these events don't.

## Privacy rules

Every analytics value is stored by Google and joined to the user's `user_id`.
Treat a parameter like a log line: [CLAUDE.md](../CLAUDE.md) says logs are a
disclosure channel, and that applies here too.

- **Every value must come from a fixed set the code chooses.** A tab name, a
  house number, a relative day, a product id.
- **Never send:** names, birth date, time or place, connection ids or
  connection names, email, push tokens, chat text or anything else the user
  typed, horoscope or reading text.
- **Send the shape, not the content:** `length: msg.length`, never `msg`.
- **Dates go out relative to today** (`relativeDay()`), not as dates.
- **Errors:** `purchase_failed.reason` carries the SDK's error message, capped
  at 100 characters by GA4. Don't pass error messages that could contain user
  input.

The App Store privacy label and the Play Data safety form must declare what
analytics collects ("Product Interaction" and identifiers linked to the user).
Check both declarations whenever a new kind of data is added. This repo
doesn't record what they currently say.

## Adding tracking

1. **Is it an interaction inside a screen?** Call `trackInteraction` from the
   handler that already exists. Don't add a new `Events` entry.
   ```ts
   onPress={() => {
     trackInteraction({ screen: 'connections', feature: 'sort', action: 'select', item: sortKey });
     setSort(sortKey);
   }}
   ```
   - A new screen name goes into the `InteractionScreen` union first. The type
     keeps the screen list closed.
   - Choose a `feature` name that will still make sense in a report a year
     from now. Renaming it later splits its history in two.
   - When a shared component needs reporting, give it a callback prop
     (`HomeSignsDisplay`'s `onViewChart`) and let the screen do the tracking.
     The component can't know which screen it's on.
2. **Is it an outcome you will count or funnel on its own** (something got
   generated, bought or shared)? Add a typed entry to `Events`:
   - snake_case name of at most 40 characters, and param keys of at most 40;
   - typed params, so a call site can't send something unexpected;
   - **never rename an existing event.** Historical reports are keyed on the name.
3. **Fire it once.** Track inside the handler, not in render. For "viewed"
   events, guard with a `useRef` flag, as `transits.tsx` does.
4. **Test it.** See [Testing and verifying](#testing-and-verifying).
5. **Register any new param** you want to report on ([Console setup](#console-setup)).
6. **Shipping:** tracking is JavaScript only, so an OTA update delivers it.

## Console setup

Do this once per Firebase project, in **Analytics → Custom definitions →
Create custom dimension**, scope **Event**. Until a parameter is registered,
GA4 collects it but doesn't show it in any report. Registration is not
retroactive.

| Parameter | Used by |
|---|---|
| `screen`, `feature`, `action`, `item` | `ui_interaction`. **Register these first** |
| `day` | `horoscope_viewed` |
| `source` | `tarot_drawn`, `paywall_viewed`, `paywall_dismissed`, `chat_exported` |
| `saved`, `premium`, `mode` | `synastry_viewed`, `natal_breakdown_viewed`, `chat_message_sent` |
| `first_person`, `relationship`, `change` | `connection_created`, `connection_updated` |
| `format`, `destination` | `chat_exported` |
| `method`, `product_id` | auth and purchase events |

`length`, `cards` and `count` are numbers; register them as **custom metrics** if you
want sums or averages.

There are 50 event-scoped dimension slots per property. Register what you will
actually report on.

Optional, but recommended: **Project settings → Integrations → BigQuery → Link**,
with daily export. It includes every parameter, whether or not it is
registered. Check current BigQuery pricing and quotas before linking it.

## Testing and verifying

### Unit and component tests

`jest.setup.js` stubs `@react-native-firebase/analytics`, so the real
`analytics.service.ts` runs under Jest and every event reaches the stub's
`logEvent`. To check what a screen reported, assert on that stub:

```ts
import { logEvent } from '@react-native-firebase/analytics';

const events = (name: string) =>
  (logEvent as jest.Mock).mock.calls.filter(([, n]) => n === name).map(([, , p]) => p);

fireEvent.press(houseCard(1));
expect(events('ui_interaction')).toEqual([
  { screen: 'transits', feature: 'house_card', action: 'expand', item: 'house_1' },
]);
```

Examples are in the `analytics` blocks of `transits.test.tsx`,
`birth-chart-view.test.tsx` and `app/(main)/__tests__/index.test.tsx`. The
helpers are covered in `src/services/__tests__/analytics.service.test.ts`.

A test that mocks `@/src/services/analytics.service` wholesale (as
`chat.test.tsx` does) has to list every export the screen uses, or the screen
throws on the missing one.

### On a device (DebugView)

DebugView shows events within seconds instead of the usual reporting delay.

1. Collection is off outside production, so a dev build sends nothing even in
   debug mode. For a local check, temporarily change the init call in
   `analytics.service.ts` to `setAnalyticsCollectionEnabled(getAnalytics(), true)`.
   **Revert it before committing.**
2. Turn on debug mode:
   - **Android:** `adb shell setprop debug.firebase.analytics.app com.mobile.delaluna.answers`
     (turn it off with `adb shell setprop debug.firebase.analytics.app .none.`)
   - **iOS:** add `-FIRDebugEnabled` to the scheme's launch arguments in Xcode.
3. Open **Analytics → DebugView** in the project the *native* SDK reports to.
   Test-backend builds report to `delaluna-answers-test`, chosen by
   `USES_TEST_BACKEND` in `app.config.js`.

## Reading the data

**In GA4 / the Firebase console:**

- *Most-used screens:* Reports → Engagement → Pages and screens (views,
  users and engagement time per `screen_name`).
- *Most-used features:* Explore → Free form. Use event name = `ui_interaction`
  as a filter, `screen` and `feature` as rows, and event count and total users
  as values. Add `item` as a nested row to see which tab or house.
- *Teaser → paywall:* `ui_interaction` with `action = unlock`, by `feature`,
  next to `paywall_viewed` and `purchase_completed` in a funnel exploration.
- *Content actually seen:* `horoscope_viewed` by `day`, against `screen_view`
  for Home.

**In BigQuery,** once the export is linked: the most-used features over the
last 28 days, by distinct users. Replace `XXXXXXXXX` with the dataset id that
the export creates.

```sql
SELECT
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'screen')  AS screen,
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'feature') AS feature,
  COUNT(*)                        AS interactions,
  COUNT(DISTINCT user_pseudo_id)  AS users
FROM `delaluna-answers.analytics_XXXXXXXXX.events_*`
WHERE event_name = 'ui_interaction'
  AND _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 28 DAY))
                        AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
GROUP BY screen, feature
ORDER BY users DESC;
```

Rank by `users` rather than `interactions`. A few people tapping a control
many times shouldn't outrank a control most people use once.

## Known gaps

- **The first-run tour is invisible, by design.** Nothing is logged while it is on
  screen (`setAnalyticsSuppressed`, set by `src/context/tour-context.tsx`), including
  the screen views of the tabs it opens itself. A user who takes the tour shows no
  Connections or Transits view until they open one on their own.

- **`purchase_started` is never sent.** RevenueCat's own paywall UI owns the
  buy button, so the app can't see the moment a purchase begins. Funnels go
  straight from `paywall_viewed` to `purchase_completed` / `purchase_failed`.
- **`paywall_viewed` with `source: "manual"` also covers the chat-pack sheet.**
  It can't be told apart from the subscription paywall.
- **Not yet instrumented:** the settings screens, and the auth and utility
  screens, have screen views only, with no `ui_interaction`.
- **Score names come from the model.** `score_definition` is only reported for
  scores that match a `KEYWORD_DEFINITIONS` key, so a score the model names
  differently gets no definition and is not tracked.
- **Boolean params are unverified.** GA4 documents string and number values
  only, and `has_time`, `saved`, `premium`, `success` and the `chat_exported`
  flags are sent as booleans. Check how they arrive in DebugView or BigQuery
  before building a report on them. If they are dropped, convert them to
  strings in `logEvent`, accepting that it changes the stored type for events
  that already have history.
- **Read depth only on Synastry.** Home and the birth-chart breakdown are long
  scrolls too, but nothing yet records how far down people read them.
  `useSectionsReached` is the hook to add for that.
- **No in-app opt-out.** `setAnalyticsEnabled()` exists, but no settings
  control calls it.
