/**
 * Static Hugeicons registry.
 *
 * The design prototype used a string-name API (`<Icon name="Target01Icon" />`)
 * backed by a runtime CDN import of the ENTIRE icon set. That is not
 * tree-shakeable. Here we statically import only the icons the app uses and map
 * them by name, preserving the same string API while keeping the bundle small.
 * A name missing from this map is a TypeScript error at the call site.
 *
 * Icon data shape: each icon is an array of [tagName, attrs] nodes — consumed by
 * components/icons/Icon.tsx, which renders them into an <svg>.
 */
import {
  // brand / AI
  SparklesIcon,
  AiMagicIcon,
  // categories / stats
  Target01Icon,
  BulbIcon,
  Idea01Icon,
  Alert02Icon,
  ChartIncreaseIcon,
  FlashIcon,
  Megaphone01Icon,
  // status / verification
  CheckmarkBadge01Icon,
  ShieldUserIcon,
  Flag02Icon,
  // nav / chrome
  DashboardSquare01Icon,
  News01Icon,
  Bookmark01Icon,
  Settings01Icon,
  Search01Icon,
  Notification01Icon,
  Notification03Icon,
  FilterHorizontalIcon,
  RefreshIcon,
  RadarIcon,
  Menu01Icon,
  MoreHorizontalIcon,
  // actions / arrows
  ArrowUpRight01Icon,
  ArrowRight01Icon,
  ArrowLeft01Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  Add01Icon,
  PlusSignIcon,
  Cancel01Icon,
  Delete02Icon,
  Tick02Icon,
  Tag01Icon,
  LinkSquare02Icon,
  Mail01Icon,
  Loading03Icon,
  Logout01Icon,
  // sources / socials / providers
  Globe02Icon,
  NewTwitterIcon,
  Linkedin01Icon,
  InstagramIcon,
  Facebook01Icon,
  YoutubeIcon,
  TiktokIcon,
  RedditIcon,
  GoogleIcon,
} from "@hugeicons/core-free-icons";

export const ICONS = {
  SparklesIcon,
  AiMagicIcon,
  Target01Icon,
  BulbIcon,
  Idea01Icon,
  Alert02Icon,
  ChartIncreaseIcon,
  FlashIcon,
  Megaphone01Icon,
  CheckmarkBadge01Icon,
  ShieldUserIcon,
  Flag02Icon,
  DashboardSquare01Icon,
  News01Icon,
  Bookmark01Icon,
  Settings01Icon,
  Search01Icon,
  Notification01Icon,
  Notification03Icon,
  FilterHorizontalIcon,
  RefreshIcon,
  RadarIcon,
  Menu01Icon,
  MoreHorizontalIcon,
  ArrowUpRight01Icon,
  ArrowRight01Icon,
  ArrowLeft01Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  Add01Icon,
  PlusSignIcon,
  Cancel01Icon,
  Delete02Icon,
  Tick02Icon,
  Tag01Icon,
  LinkSquare02Icon,
  Mail01Icon,
  Loading03Icon,
  Logout01Icon,
  Globe02Icon,
  NewTwitterIcon,
  Linkedin01Icon,
  InstagramIcon,
  Facebook01Icon,
  YoutubeIcon,
  TiktokIcon,
  RedditIcon,
  GoogleIcon,
} as const;

export type IconName = keyof typeof ICONS;
