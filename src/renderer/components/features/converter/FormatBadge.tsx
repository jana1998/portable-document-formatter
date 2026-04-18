import React from 'react';
import {
  FileText,
  FileSpreadsheet,
  Presentation,
  Image as ImageIcon,
  Code,
  FileType,
  BookOpen,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@renderer/lib/utils';
import type { DocumentFormat } from '@renderer/types';

interface FormatBadgeProps {
  format: DocumentFormat;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Format detection badge component
 * Displays the detected document format with appropriate icon and styling
 */
export function FormatBadge({ format, className, size = 'md' }: FormatBadgeProps) {
  const config = getFormatConfig(format);

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-3 py-1 text-sm gap-1.5',
    lg: 'px-4 py-1.5 text-base gap-2',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  const Icon = config.icon;

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-pill font-medium',
        'border border-border/50 transition-colors',
        config.bgColor,
        config.textColor,
        sizeClasses[size],
        className
      )}
    >
      <Icon className={iconSizes[size]} />
      <span className="uppercase tracking-wide">{config.label}</span>
    </div>
  );
}

/**
 * Get configuration for each document format
 */
function getFormatConfig(format: DocumentFormat) {
  const configs: Record<
    DocumentFormat,
    {
      label: string;
      icon: typeof FileText;
      bgColor: string;
      textColor: string;
    }
  > = {
    pdf: {
      label: 'PDF',
      icon: FileText,
      bgColor: 'bg-red-500/10 dark:bg-red-500/20',
      textColor: 'text-red-700 dark:text-red-400',
    },
    docx: {
      label: 'Word',
      icon: FileType,
      bgColor: 'bg-blue-500/10 dark:bg-blue-500/20',
      textColor: 'text-blue-700 dark:text-blue-400',
    },
    pptx: {
      label: 'PowerPoint',
      icon: Presentation,
      bgColor: 'bg-orange-500/10 dark:bg-orange-500/20',
      textColor: 'text-orange-700 dark:text-orange-400',
    },
    xlsx: {
      label: 'Excel',
      icon: FileSpreadsheet,
      bgColor: 'bg-green-500/10 dark:bg-green-500/20',
      textColor: 'text-green-700 dark:text-green-400',
    },
    image: {
      label: 'Image',
      icon: ImageIcon,
      bgColor: 'bg-purple-500/10 dark:bg-purple-500/20',
      textColor: 'text-purple-700 dark:text-purple-400',
    },
    html: {
      label: 'HTML',
      icon: Code,
      bgColor: 'bg-pink-500/10 dark:bg-pink-500/20',
      textColor: 'text-pink-700 dark:text-pink-400',
    },
    epub: {
      label: 'EPUB',
      icon: BookOpen,
      bgColor: 'bg-indigo-500/10 dark:bg-indigo-500/20',
      textColor: 'text-indigo-700 dark:text-indigo-400',
    },
    txt: {
      label: 'Text',
      icon: FileText,
      bgColor: 'bg-gray-500/10 dark:bg-gray-500/20',
      textColor: 'text-gray-700 dark:text-gray-400',
    },
    unknown: {
      label: 'Unknown',
      icon: HelpCircle,
      bgColor: 'bg-muted',
      textColor: 'text-muted-foreground',
    },
  };

  return configs[format] || configs.unknown;
}
