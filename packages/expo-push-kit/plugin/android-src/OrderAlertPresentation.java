package {{PACKAGE}};

/**
 * The single rule for which surface presents an incoming order, so exactly one
 * card is ever on screen.
 *
 * Android-free so it can be unit-tested. The rule used to live as separate
 * boolean checks at four call sites, each free to disagree; that is how a
 * rider and a merchant ended up looking at the in-app sheet and the floating
 * native card at the same time.
 */
public final class OrderAlertPresentation {

  /** Which surface owns the card right now. */
  public enum Surface {
    /** The app's own React sheet is up. Native must stay out of the way. */
    IN_APP,
    /** Lock-screen activity owns it; a WindowManager twin would double up. */
    LOCK_SCREEN,
    /** Floating TYPE_APPLICATION_OVERLAY card over whatever else is running. */
    OVERLAY,
    /** The rider or merchant swiped this card away. Audio continues. */
    NONE
  }

  private OrderAlertPresentation() {}

  /**
   * Order matters, most specific first.
   *
   * `jsOwned` comes from claim()/release() and is the only *positive* statement
   * that a card is already on screen. `appInForeground` is inferred from the
   * activity counter and process importance, so it is a backstop for the window
   * between an alert arriving and the React tree attaching to it — not a
   * replacement for the claim.
   */
  public static Surface resolve(
      boolean jsOwned,
      boolean appInForeground,
      boolean deviceLocked,
      boolean cardDismissedByUser
  ) {
    // Checked before dismissal: the lock screen is a fresh presentation of an
    // offer the rider may have waved away on the home screen earlier.
    if (deviceLocked) return Surface.LOCK_SCREEN;
    if (jsOwned) return Surface.IN_APP;
    // The app is up but has not claimed yet — its sheet is about to appear, so
    // do not flash a native card in front of it.
    if (appInForeground) return Surface.IN_APP;
    if (cardDismissedByUser) return Surface.NONE;
    return Surface.OVERLAY;
  }

  /** True only when the floating WindowManager card should be mounted. */
  public static boolean shouldMountOverlay(
      boolean jsOwned,
      boolean appInForeground,
      boolean deviceLocked,
      boolean cardDismissedByUser
  ) {
    return resolve(jsOwned, appInForeground, deviceLocked, cardDismissedByUser) == Surface.OVERLAY;
  }
}
