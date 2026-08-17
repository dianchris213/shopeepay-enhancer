import { FolderPlus, SearchX, Settings2 } from "lucide-react";

type Props = {
  /** Heading line. */
  title: string;
  /** One-sentence explanation of what categories do / what to do next. */
  description: string;
  /** Primary call to action (usually "Create category" / "Open Settings"). */
  actionLabel?: string;
  onAction?: () => void;
  /** Search/filter variant renders a different icon and a muted CTA. */
  variant?: "empty" | "no-results";
  /** Compact spacing for the Add Transaction picker. */
  dense?: boolean;
  testId?: string;
  actionTestId?: string;
};

/**
 * Professional empty-state shared by Manage Categories and the Add Transaction
 * category picker so both surfaces always tell the same story.
 */
export function CategoryEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  variant = "empty",
  dense = false,
  testId,
  actionTestId,
}: Props) {
  const Icon = variant === "no-results" ? SearchX : FolderPlus;

  return (
    <div
      data-testid={testId}
      className={`glass grid place-items-center gap-2 rounded-2xl text-center ${
        dense ? "px-4 py-6" : "px-5 py-9"
      }`}
    >
      <span className="bg-primary/10 text-primary grid size-11 place-items-center rounded-full">
        <Icon className="size-5" strokeWidth={1.9} />
      </span>
      <p className="text-sm font-semibold tracking-tight">{title}</p>
      <p className="text-muted-foreground max-w-[15rem] text-[11px] leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          data-testid={actionTestId}
          data-empty-link="true"
          className={`tap mt-1.5 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold ${
            variant === "no-results"
              ? "glass text-muted-foreground"
              : "from-primary to-primary-foreground/40 text-primary-foreground shadow-primary/25 bg-gradient-to-r shadow-lg"
          }`}
        >
          {variant === "no-results" ? null : <Settings2 className="size-3.5" strokeWidth={2.2} />}
          {actionLabel}
        </button>
      )}
    </div>
  );
}
