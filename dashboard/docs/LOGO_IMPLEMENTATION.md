# Logo Implementation Guide

## Overview

Two logo variants are used throughout the application:
- **`logo.png`** - Full logo with design + text (used on login/auth pages)
- **`onlylogo.png`** - Icon-only logo, just the design (used in sidebar, header, compact spaces)

## Logo Placement Strategy

### 1. Login Page (`/login`)
- **Logo**: Full logo (`logo.png`)
- **Size**: Large (lg)
- **Placement**: Centered at top, prominent display
- **Responsive**: Scales from 200px (mobile) to 240px (desktop)

### 2. Auth Callback Page (`/auth/callback`)
- **Logo**: Full logo (`logo.png`)
- **Size**: Medium (md)
- **Placement**: Centered above loading spinner
- **Purpose**: Brand recognition during OAuth redirect

### 3. Sidebar (Dashboard Navigation)
- **Logo**: Icon-only (`onlylogo.png`) + Text "GatiMitra"
- **Size**: Medium (md)
- **Placement**: Top center of sidebar
- **Responsive**: 
  - Full width on mobile (w-full)
  - Fixed 256px (w-64) on desktop (sm:w-64)
- **Features**: Clickable link to dashboard home

### 4. Header (Dashboard Top Bar)
- **Logo**: Icon-only (`onlylogo.png`) - Mobile only
- **Size**: Small (sm)
- **Placement**: Left side, visible only on mobile (< 640px)
- **Desktop**: Hidden (logo already in sidebar)
- **Purpose**: Brand consistency on mobile when sidebar is collapsed

## Component Usage

### Logo Component API

```tsx
<Logo
  variant="full" | "icon-only"    // Which logo to use
  size="sm" | "md" | "lg" | "xl"  // Size variant
  showText={boolean}               // Show text with icon-only (sidebar only)
  className={string}               // Additional CSS classes
  href={string}                    // Optional link URL
/>
```

### Examples

```tsx
// Login page - Full logo
<Logo variant="full" size="lg" />

// Sidebar - Icon with text
<Logo variant="icon-only" size="md" showText={true} href="/dashboard" />

// Header mobile - Icon only
<Logo variant="icon-only" size="sm" href="/dashboard" />
```

## Responsive Design

### Breakpoints Used
- **Mobile**: < 640px (default)
- **Tablet**: ≥ 640px (sm:)
- **Desktop**: ≥ 1024px (lg:)

### Responsive Features
1. **Login Page**:
   - Padding: `p-6 sm:p-8 md:p-10`
   - Logo: `max-w-[200px] sm:max-w-[240px]`
   - Text: `text-2xl sm:text-3xl`

2. **Sidebar**:
   - Width: `w-full sm:w-64` (full width mobile, fixed desktop)
   - Logo: Scales appropriately
   - Navigation: Scrollable on overflow

3. **Header**:
   - Logo: Visible only on mobile (`sm:hidden`)
   - Padding: `px-4 sm:px-6`
   - Text: `text-base sm:text-lg`

## Image Optimization

- Uses Next.js `Image` component for automatic optimization
- `priority` flag set for above-the-fold logos
- `quality={95}` for crisp display
- `object-contain` to maintain aspect ratio
- Proper `alt` text for accessibility

## Accessibility

- All logos have descriptive alt text
- Clickable logos are wrapped in semantic `<Link>` components
- Proper focus states for interactive elements
- High contrast for text overlays

## Performance

- Images are optimized by Next.js automatically
- Lazy loading for below-the-fold content
- Priority loading for critical logos (login page)
- Proper caching headers

## Future Enhancements

- Add dark mode logo variants
- Add animated logo for loading states
- Add logo favicon configuration
- Add retina/high-DPI logo variants
