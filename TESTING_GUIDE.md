# Delaluna Answers - Testing Guide

This guide walks through every feature of the app. Follow each section step-by-step and verify the expected behavior.

---

## Table of Contents

1. [Sign Up](#1-sign-up)
2. [Email Verification](#2-email-verification)
3. [Login](#3-login)
4. [Home Screen](#4-home-screen)
5. [Connections](#5-connections)
6. [Transits](#6-transits)
7. [Chat](#7-chat)
8. [Profile](#8-profile)

---

## 1. Sign Up

**Where:** Launch the app > tap "Sign up" on the login screen.

Sign-up is a guided chat-style flow with 8 steps. Complete each step before moving to the next.

| Step | What You Enter | Notes |
|------|---------------|-------|
| 1 | First Name | Type any name |
| 2 | Last Name | Type any name |
| 3 | Pronouns | Choose one: She/Her, He/Him, They/Them, or Non Binary |
| 4 | Birthday | Use the date picker to select a date |
| 5 | Birth Time | Use the time picker (or skip if unknown) |
| 6 | Place of Birth | Start typing a city name and select from the search results |
| 7 | Email | Enter a valid email address |
| 8 | Password | Minimum 6 characters |

**What to verify:**
- [ ] Each step advances to the next after submitting
- [ ] "Go Back" button returns to the previous step
- [ ] "Cancel" button shows a confirmation popup ("Discard signup?")
- [ ] Choosing "Keep editing" in the popup returns to the form
- [ ] Choosing "Discard & Exit" returns to the login screen
- [ ] After step 8, a loading screen appears with progress messages:
  - "Creating your account..."
  - "Setting up your profile..."
  - "Calculating your birth chart..."
- [ ] You are taken to the Email Verification screen

---

## 2. Email Verification

**Where:** Automatically shown after sign-up.

| Element | Expected Behavior |
|---------|-------------------|
| Masked email | Shows your email partially hidden (e.g., "em...@example.com") |
| 6-digit code boxes | One box per digit, cursor auto-advances to next box |
| Verify button | Submits the code |
| Resend code | Sends a new code (disabled for 60 seconds after each send) |
| "Already verified? Reload" | Refreshes your verification status |
| "Use a different account" | Signs you out and returns to login |

**What to verify:**
- [ ] Check your email for the 6-digit verification code
- [ ] Entering all 6 digits triggers automatic verification
- [ ] Incorrect code shows an error message
- [ ] "Resend code" shows a countdown timer ("Resend in 60s") and re-enables after 60 seconds
- [ ] After successful verification, a progress indicator appears while your chart data generates
- [ ] You are redirected to the Home screen once everything is ready

---

## 3. Login

**Where:** App launch screen (if not already signed in).

| Field | What to Enter |
|-------|--------------|
| Email | Your registered email |
| Password | Your password |

**What to verify:**
- [ ] Leaving email or password empty shows an alert
- [ ] Incorrect credentials show an error message
- [ ] Eye icon next to the password field toggles password visibility
- [ ] "Forgot Password?" link opens the password reset screen
- [ ] "Not a member? Sign up" link opens the sign-up flow
- [ ] Successful login takes you to the Home screen
- [ ] The Delaluna logo hides when the keyboard is open

---

## 4. Home Screen

**Where:** First tab after login (Home tab).

### 4a. Header & Signs

- [ ] Your name appears in the header (or "Home" if name is unavailable)
- [ ] Your avatar is shown in the top-right corner
- [ ] Tapping the avatar opens the Profile screen
- [ ] Your Sun, Moon, and Rising signs are displayed below the header

### 4b. View Birth Chart

- [ ] A "View Birth Chart" button appears below your signs
- [ ] Tapping it opens the Birth Chart screen
- [ ] The chart screen has two top tabs: **Natal Wheel** and **Natal Table**
  - [ ] "Natal Wheel" shows a circular chart visualization
  - [ ] "Natal Table" shows planets/houses in a table format
- [ ] Below the chart, there are breakdown tabs: **Insights**, **Houses**, **Planets**, **Aspects**
  - [ ] **Insights** (free users): Shows Overview, Big Picture teaser, and Release
  - [ ] **Insights** (premium users): Shows Overview, Love, Career, Growth, Advice, Warning, Affirmation, Release
  - [ ] **Houses**: Shows 12 house cards -- free users see 3 unlocked houses; premium sees all 12
  - [ ] **Planets** (premium only): Shows planet cards with sign, house, and interpretation
  - [ ] **Aspects** (premium only): Shows aspect cards with orb and interpretation
  - [ ] Locked content shows a lock icon and premium upgrade prompt

### 4c. Daily Content

The home screen shows daily horoscope content in scrollable sections:

- [ ] **Date Switcher** - Shows yesterday, today, and tomorrow. Free users can only view today; premium users can navigate to other days.
- [ ] **Quote** - AI-generated daily quote
- [ ] **Advice** - Daily advice text
- [ ] **Do's** - Bulleted list of things to do
- [ ] **Don'ts** - Bulleted list of things to avoid
- [ ] **Affirmation** - Daily affirmation text

### 4d. Reveal Cards (Tarot)

- [ ] A "Today's Cards" section appears with cards face-down (covered)
- [ ] Tap the "Reveal Cards" button
- [ ] Cards flip to reveal their faces
- [ ] Interpretations appear below the revealed cards

### 4e. Message in a Bottle

- [ ] A "Message in a Bottle" section is visible on the home screen

### 4f. Additional Sections

- [ ] **Moon Phase** - Shows the moon phase name, illumination percentage, and sign
- [ ] **Planets in Retrograde** - Lists any planets currently in retrograde
- [ ] **New Love** - Definition text with a button "What energies surround new love?" (tapping opens chat)
- [ ] **Returns** - Definition text with two buttons: "Will they return?" and "How long until they return?" (tapping opens chat)
- [ ] **Lucky Numbers** - A list of numbers
- [ ] **Warning** - Warning text for the day

### 4g. Pull to Refresh

- [ ] Pull down on the home screen to refresh the daily content

---

## 5. Connections

**Where:** Second tab (Connections).

### 5a. Empty Connections List

- [ ] When you have no connections, a large "Add Connection" button is displayed
- [ ] Tapping it opens the New Connection form

### 5b. Add a New Connection

**Where:** Tap the "+" button in the header (or the add button in the empty state).

The form collects birth data for two people:

| Field (per person) | What to Enter |
|---------------------|--------------|
| First Name | Text |
| Last Name | Text |
| Pronouns | Choose from list |
| Birthday | Date picker |
| Time of Birth | Time picker (or toggle "Unknown birth time") |
| Place of Birth | Search and select a location (or toggle "Unknown place of birth") |

You also select a **Relationship Type** (e.g., Romantic, Friendship, etc.).

**What to verify:**
- [ ] Both Person 1 and Person 2 sections are visible and fillable
- [ ] "Unknown birth time" toggle disables the time picker
- [ ] "Unknown place of birth" toggle disables the location search
- [ ] Location search returns results as you type
- [ ] Tapping "Calculate Compatibility" shows a loading animation
- [ ] After loading, you are taken to the Connection detail screen
- [ ] Free users are limited to 3 connections; premium users can have up to 10
- [ ] An alert appears when trying to exceed the connection limit

### 5c. Non-Empty Connections List

- [ ] Each connection shows as "Person1 Name + Person2 Name"
- [ ] Tapping a connection opens its detail page
- [ ] Swiping left on a connection reveals a red Delete action
- [ ] Confirming delete removes the connection from the list

### 5d. View Connection Detail

**Where:** Tap any connection in the list.

**What to verify:**
- [ ] Header shows "Compatibility" with a back button and an edit button
- [ ] The two names are displayed at the top with the relationship type as status
- [ ] An **Overall Score** percentage is shown prominently (e.g., "78%")
- [ ] A report title and AI-generated summary are displayed
- [ ] **Big Three Card** shows Sun, Moon, and Rising signs for both people side-by-side
- [ ] A "Compare Birth Charts" button is visible (opens the Synastry screen)
- [ ] **16 Compatibility Scores** are listed, each with:
  - Label (e.g., Interest, Communication, Loyalty, Attraction, etc.)
  - Percentage
  - Animated color bar (green = 75%+, yellow = 50-74%, red = below 50%)
  - Tapping the label expands a definition
- [ ] Additional sections: Advice, Conflict Style, Longevity, Love Language, Warning, Final Thoughts
- [ ] While loading, rotating messages appear (e.g., "Calculating cosmic alignment...", "Reading the stars...")

### 5e. Edit / Update Connection

**Where:** Tap the edit (pencil) button on the Connection detail header.

- [ ] The edit form shows pre-filled data for both people and the relationship type
- [ ] You can modify any field
- [ ] "Save Changes" updates the connection and returns to the detail view
- [ ] A "Delete" button is available with a confirmation prompt
- [ ] Confirming delete removes the connection and returns to the list

### 5f. Synastry Analysis

**Where:** Tap "Compare Birth Charts" on a Connection detail page.

- [ ] A results screen shows aspect comparisons between the two charts
- [ ] **Key aspects** are highlighted at the top, sorted by nature
- [ ] Each aspect shows: Planet 1 > Aspect type > Planet 2
- [ ] Details include: aspect type name (Conjunction, Trine, Square, etc.), planet names, and orb in degrees/minutes
- [ ] Aspects are color-coded:
  - Green = Harmonious
  - Red = Challenging
  - Yellow = Neutral
  - Blue = Minor

---

## 6. Transits

**Where:** Third tab (Transits).

### 6a. Overview

- [ ] The screen title is "Transits"
- [ ] A definition box at the top explains what transits are

### 6b. Transit House Cards

There are 12 house cards, one for each astrological house.

**Collapsed state (default):**
- [ ] Each card shows the house number, a keyword, and transiting planet chips
- [ ] Planet chips are color-coded by planet and show name + degree + sign

**Expanded state (tap to expand):**
- [ ] Tapping a house card expands it
- [ ] The expanded view shows the full interpretation text
- [ ] Tapping again collapses the card

### 6c. Free vs Premium

- [ ] **Free users:** Only the 3 most active houses are unlocked; other houses show a lock icon and "Unlock with Premium" message
- [ ] **Premium users:** All 12 houses are fully expanded and readable
- [ ] An "Unlock All 12 Houses" button appears for free users

### 6d. Pull to Refresh

- [ ] Pull down to regenerate the transit reading

---

## 7. Chat

**Where:** Fourth tab (Chat).

### 7a. Empty Chat State

- [ ] The heading "What's on your mind?" is displayed
- [ ] 5 suggestion chips rotate every ~7 seconds with pre-written questions, such as:
  - "What does my birth chart say about my love life?"
  - "What energies are influencing me right now?"
  - "What should I focus on this week?"
  - "How can I better understand my emotions?"
  - "What does my rising sign reveal about me?"
- [ ] Tapping a suggestion chip sends it as your message

### 7b. Using Funnel Questions (from Home Screen)

- [ ] On the Home screen, tapping question buttons (e.g., "What energies surround new love?", "Will they return?") opens the Chat tab with the question pre-filled and sent
- [ ] The AI response appears in a left-aligned bubble

### 7c. Asking Your Own Questions

- [ ] The input bar at the bottom has placeholder text: "Ask Delaluna anything..."
- [ ] Type a question (500 character max)
- [ ] Tap the purple send arrow to submit
- [ ] Your message appears in a right-aligned purple bubble
- [ ] An animated typing indicator (dots) appears while the AI responds
- [ ] The AI response appears in a left-aligned bubble
- [ ] Below the input, a counter shows "X questions remaining today"

### 7d. Question Limits

| Plan | Daily Limit |
|------|-------------|
| Free | 3 questions |
| Premium | 5 questions |

- [ ] The remaining question count decreases after each sent message
- [ ] When the limit is reached, a paygate/upgrade prompt appears
- [ ] Free users see an unlock button to add 5 bonus questions

### 7e. Error Handling / Retry

- [ ] If the AI takes longer than 60 seconds to respond, a red "Retry" button appears
- [ ] Tapping "Retry" deletes the stuck message and re-sends it
- [ ] If the AI response errors, the "Retry" button also appears

### 7f. New Chat

- [ ] Tap the "+" button in the Chat header to start a new conversation

---

## 8. Profile

**Where:** Tap your avatar on the Home screen header.

### 8a. View Profile

- [ ] Your avatar image is displayed prominently with a pencil badge for editing
- [ ] Your name and email are shown
- [ ] A badge indicates your plan: "PREMIUM MEMBER" (gold) or "FREE PLAN" (lock icon)
- [ ] Your birth details are listed:
  - Birthday (formatted: "Month Day, Year")
  - Birth time (formatted: "H:MM AM/PM")
  - Place of birth
  - Pronouns

### 8b. Activate / Deactivate Premium

- [ ] The profile screen clearly shows your current plan status
- [ ] If on Free plan, the badge reads "FREE PLAN" with a lock icon
- [ ] If on Premium, the badge reads "PREMIUM MEMBER" with a gold sparkle
- [ ] Throughout the app, premium-locked features prompt an upgrade when tapped

### 8c. Edit Profile

**Where:** Tap "Edit Profile" on the Profile screen.

**Editable fields:**

| Field | Input Type |
|-------|-----------|
| First Name | Text |
| Last Name | Text |
| Pronouns | Dropdown choice |
| Email | Text (updates Firebase email) |
| Birthday | Date picker |
| Birth Time | Time picker (toggle "Unknown birth time" to disable) |
| Place of Birth | Location search (toggle "Unknown place of birth" to disable) |

### 8d. Updating Birth Details

When you change any birth-related field (birthday, birth time, or place of birth):

- [ ] Tapping "Save Changes" shows a confirmation popup warning that your birth chart will be recalculated
- [ ] Confirming shows a loading state: "Recalculating your birth chart..."
- [ ] After recalculation, you return to the Profile screen with updated data
- [ ] Your birth chart, horoscope, and related content now reflect the new birth details

### 8e. Updating Other Details (Name, Pronouns, Email)

When you change non-birth fields only:

- [ ] Tapping "Save Changes" saves immediately with a brief loading state ("Saving changes...")
- [ ] No recalculation prompt appears
- [ ] You return to the Profile screen with the updated information

### 8f. Other Profile Actions

- [ ] **Avatar:** Tapping the pencil on your avatar opens the avatar selection screen
- [ ] **Notifications:** An "Enable Notifications" button appears if notifications are not yet granted
- [ ] **Theme:** A theme selector option opens the theme picker (7 themes available)
- [ ] **Log Out:** Shows a confirmation alert before signing out
- [ ] **Delete Account:** Shows a confirmation alert (may require re-authentication) before permanently deleting your account

---

## Quick Reference - Navigation Map

```
App Launch
  |-- Login .............. Email + Password
  |-- Sign Up ............ 8-step guided flow --> Email Verification --> Home
  
Home Tab
  |-- View Birth Chart ... Natal Wheel / Table + Insights / Houses / Planets / Aspects
  |-- Reveal Cards ....... Tarot cards section
  |-- Question Buttons ... Opens Chat with pre-filled question
  |-- Avatar ............. Opens Profile

Connections Tab
  |-- Add Connection ..... Two-person birth data form
  |-- View Connection .... Scores + Report + Compare Charts
  |-- Edit Connection .... Update details or delete
  |-- Synastry ........... Cross-chart aspect comparison

Transits Tab
  |-- 12 House Cards ..... Tap to expand/collapse
  |-- Pull to Refresh .... Regenerate reading

Chat Tab
  |-- Suggestion Chips ... Pre-written questions
  |-- Free Text Input .... Ask anything (500 char max)
  |-- Retry .............. Re-send stuck messages

Profile
  |-- Edit Profile ....... Update name, email, birth details
  |-- Theme .............. Choose from 7 visual themes
  |-- Notifications ...... Enable push notifications
  |-- Log Out / Delete ... Account management
```

---

## Free vs Premium Feature Comparison

| Feature | Free | Premium |
|---------|------|---------|
| Daily Horoscope | Today only | Yesterday, Today, Tomorrow |
| Birth Chart Insights | Overview, Big Picture teaser, Release | All 8 insight categories |
| Birth Chart Houses | 3 most relevant houses | All 12 houses |
| Birth Chart Planets | Locked | Full access |
| Birth Chart Aspects | Locked | Full access |
| Transit Houses | 3 most active houses | All 12 houses |
| Chat Questions | 3/day (+5 bonus unlock) | 5/day |
| Connections | Up to 3 | Up to 10 |
