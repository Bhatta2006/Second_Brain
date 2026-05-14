"use client";

import { Star, Trash2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { itemsApi, type Item } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ItemCardProps {
  item: Item;
  onStar?: (item: Item) => void;
  onClick?: (item: Item) => void;
  onDelete?: (item: Item) => void;
}

export function ItemCard({ item, onStar, onClick, onDelete }: ItemCardProps) {
  const displayTitle = item.title || item.ai_title || "Untitled";
  const isAiTitle = !item.title && item.ai_title;

  return (
    <Card
      className={cn(
        "group cursor-pointer transition-all hover:shadow-md",
        item.is_starred && "border-yellow-200 dark:border-yellow-800"
      )}
      onClick={() => onClick?.(item)}
    >
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3
              className={cn(
                "font-medium text-sm leading-snug truncate",
                isAiTitle && "text-muted-foreground italic"
              )}
            >
              {displayTitle}
            </h3>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity",
                item.is_starred && "opacity-100 text-yellow-500"
              )}
              onClick={(e) => {
                e.stopPropagation();
                onStar?.(item);
              }}
            >
              <Star className="h-3.5 w-3.5" fill={item.is_starred ? "currentColor" : "none"} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(item);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-2">
        {item.summary && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {item.summary}
          </p>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-mono">
              {item.content_type}
            </Badge>
            {item.folder && (
              <span className="text-[10px] text-muted-foreground">
                {item.folder.emoji} {item.folder.name}
              </span>
            )}
          </div>
          {item.source_url && (
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                #{tag}
              </Badge>
            ))}
            {item.tags.length > 3 && (
              <Badge variant="secondary" className="text-[10px]">
                +{item.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
