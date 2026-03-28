import React, { useRef, useEffect, useState } from 'react';
import { usePDFStore } from '@renderer/store/usePDFStore';
import type { Annotation, Point } from '@renderer/types';
import { annotationService } from '@/services/annotation-service';
import { MessageSquare, CheckCircle, XCircle, Lock, FileText, FileCheck, AlertCircle, CheckSquare } from 'lucide-react';

interface AnnotationLayerProps {
  pageNumber: number;
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
}

export function AnnotationLayer({
  pageNumber,
  canvasWidth,
  canvasHeight,
  scale,
}: AnnotationLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { annotations, currentTool, addAnnotation, selectedAnnotationId, setSelectedAnnotationId } = usePDFStore();
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentShape, setCurrentShape] = useState<any>(null);
  const [freehandPoints, setFreehandPoints] = useState<Point[]>([]);

  const pageAnnotations = annotations.get(pageNumber) || [];

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (currentTool === 'select') return;

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setStartPoint({ x, y });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing || !startPoint) return;

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // For freehand drawing, add points
    if (currentTool === 'freehand') {
      setFreehandPoints((prev) => [...prev, { x, y }]);
    } else {
      setCurrentShape({
        x: Math.min(startPoint.x, x),
        y: Math.min(startPoint.y, y),
        width: Math.abs(x - startPoint.x),
        height: Math.abs(y - startPoint.y),
        endX: x,
        endY: y,
      });
    }
  };

  const handleMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing || !startPoint) return;

    // Handle freehand drawing
    if (currentTool === 'freehand' && freehandPoints.length > 2) {
      const annotation = annotationService.createAnnotation(
        pageNumber,
        'freehand',
        {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          points: freehandPoints.map((p) => ({ x: p.x / scale, y: p.y / scale })),
        },
        getColorForTool(currentTool)
      );
      addAnnotation(annotation);
      setFreehandPoints([]);
    } else if (currentShape && currentShape.width > 5 && currentShape.height > 5) {
      // Handle shape-based annotations
      const annotationData: any = {
        x: currentShape.x / scale,
        y: currentShape.y / scale,
        width: currentShape.width / scale,
        height: currentShape.height / scale,
      };

      // For arrow, also store end point
      if (currentTool === 'arrow') {
        annotationData.endX = currentShape.endX / scale;
        annotationData.endY = currentShape.endY / scale;
      }

      const annotation = annotationService.createAnnotation(
        pageNumber,
        currentTool as any,
        annotationData,
        getColorForTool(currentTool)
      );

      addAnnotation(annotation);
    }

    setIsDrawing(false);
    setStartPoint(null);
    setCurrentShape(null);
  };

  const getColorForTool = (tool: string): string => {
    switch (tool) {
      case 'highlight':
        return '#FFFF00';
      case 'underline':
        return '#FF0000';
      case 'strikethrough':
        return '#FF0000';
      case 'rectangle':
        return '#3B82F6'; // blue
      case 'circle':
        return '#10B981'; // green
      case 'arrow':
        return '#EF4444'; // red
      case 'line':
        return '#8B5CF6'; // purple
      case 'freehand':
        return '#000000'; // black
      case 'note':
        return '#FCD34D'; // yellow
      case 'stamp':
        return '#DC2626'; // red
      default:
        return '#6B7280'; // gray
    }
  };

  const renderAnnotation = (annotation: Annotation) => {
    const { data, color, type, id } = annotation;
    const x = data.x * scale;
    const y = data.y * scale;
    const width = data.width * scale;
    const height = data.height * scale;
    const isSelected = id === selectedAnnotationId;

    const commonProps = {
      onClick: () => setSelectedAnnotationId(id),
      style: {
        cursor: 'pointer',
        stroke: isSelected ? '#000' : 'transparent',
        strokeWidth: isSelected ? 2 : 0,
      },
    };

    switch (type) {
      case 'highlight':
        return (
          <rect
            key={id}
            x={x}
            y={y}
            width={width}
            height={height}
            fill={color}
            fillOpacity={0.3}
            {...commonProps}
          />
        );
      case 'rectangle':
        return (
          <rect
            key={id}
            x={x}
            y={y}
            width={width}
            height={height}
            fill="none"
            stroke={color}
            strokeWidth={2}
            {...commonProps}
          />
        );
      case 'circle':
        return (
          <ellipse
            key={id}
            cx={x + width / 2}
            cy={y + height / 2}
            rx={width / 2}
            ry={height / 2}
            fill="none"
            stroke={color}
            strokeWidth={2}
            {...commonProps}
          />
        );
      case 'underline':
        return (
          <line
            key={id}
            x1={x}
            y1={y + height}
            x2={x + width}
            y2={y + height}
            stroke={color}
            strokeWidth={2}
            {...commonProps}
          />
        );
      case 'strikethrough':
        return (
          <line
            key={id}
            x1={x}
            y1={y + height / 2}
            x2={x + width}
            y2={y + height / 2}
            stroke={color}
            strokeWidth={2}
            {...commonProps}
          />
        );
      case 'line':
        return (
          <line
            key={id}
            x1={x}
            y1={y}
            x2={x + width}
            y2={y + height}
            stroke={color}
            strokeWidth={2}
            {...commonProps}
          />
        );
      case 'arrow':
        const arrowEndX = (data.endX || data.x + data.width) * scale;
        const arrowEndY = (data.endY || data.y + data.height) * scale;
        const angle = Math.atan2(arrowEndY - y, arrowEndX - x);
        const arrowHeadLength = 15;

        return (
          <g key={id} {...commonProps}>
            <line
              x1={x}
              y1={y}
              x2={arrowEndX}
              y2={arrowEndY}
              stroke={color}
              strokeWidth={2}
            />
            {/* Arrow head */}
            <line
              x1={arrowEndX}
              y1={arrowEndY}
              x2={arrowEndX - arrowHeadLength * Math.cos(angle - Math.PI / 6)}
              y2={arrowEndY - arrowHeadLength * Math.sin(angle - Math.PI / 6)}
              stroke={color}
              strokeWidth={2}
            />
            <line
              x1={arrowEndX}
              y1={arrowEndY}
              x2={arrowEndX - arrowHeadLength * Math.cos(angle + Math.PI / 6)}
              y2={arrowEndY - arrowHeadLength * Math.sin(angle + Math.PI / 6)}
              stroke={color}
              strokeWidth={2}
            />
          </g>
        );
      case 'freehand':
        if (!data.points || data.points.length === 0) return null;
        const pathData = data.points
          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * scale} ${p.y * scale}`)
          .join(' ');
        return (
          <path
            key={id}
            d={pathData}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...commonProps}
          />
        );
      case 'note':
        return (
          <g key={id} {...commonProps}>
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              fill={data.noteColor || '#FCD34D'}
              stroke={color}
              strokeWidth={1}
              opacity={0.9}
            />
            <foreignObject x={x} y={y} width={width} height={height}>
              <div className="flex items-center justify-center h-full p-2">
                <MessageSquare className="h-6 w-6 text-gray-700" />
              </div>
            </foreignObject>
            {data.text && (
              <text
                x={x + width / 2}
                y={y + height + 15}
                textAnchor="middle"
                fontSize="12"
                fill="#374151"
              >
                {data.text.substring(0, 20)}...
              </text>
            )}
          </g>
        );
      case 'stamp':
        return (
          <g key={id} {...commonProps}>
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              fill="none"
              stroke={color}
              strokeWidth={3}
              strokeDasharray="4"
              rx={4}
            />
            <text
              x={x + width / 2}
              y={y + height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="14"
              fontWeight="bold"
              fill={color}
              transform={`rotate(-15 ${x + width / 2} ${y + height / 2})`}
            >
              {data.stampType?.toUpperCase() || 'STAMP'}
            </text>
          </g>
        );
      default:
        return null;
    }
  };

  return (
    <svg
      ref={svgRef}
      className="annotation-layer absolute top-0 left-0"
      width={canvasWidth}
      height={canvasHeight}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{ pointerEvents: currentTool !== 'select' ? 'auto' : 'auto' }}
    >
      {pageAnnotations.map(renderAnnotation)}

      {/* Preview while drawing */}
      {isDrawing && currentShape && currentTool === 'highlight' && (
        <rect
          x={currentShape.x}
          y={currentShape.y}
          width={currentShape.width}
          height={currentShape.height}
          fill="#FFFF00"
          fillOpacity={0.3}
        />
      )}
      {isDrawing && currentShape && currentTool === 'rectangle' && (
        <rect
          x={currentShape.x}
          y={currentShape.y}
          width={currentShape.width}
          height={currentShape.height}
          fill="none"
          stroke="#3B82F6"
          strokeWidth={2}
        />
      )}
      {isDrawing && currentShape && currentTool === 'circle' && (
        <ellipse
          cx={currentShape.x + currentShape.width / 2}
          cy={currentShape.y + currentShape.height / 2}
          rx={currentShape.width / 2}
          ry={currentShape.height / 2}
          fill="none"
          stroke="#10B981"
          strokeWidth={2}
        />
      )}
      {isDrawing && currentShape && currentTool === 'line' && (
        <line
          x1={startPoint?.x}
          y1={startPoint?.y}
          x2={currentShape.endX}
          y2={currentShape.endY}
          stroke="#8B5CF6"
          strokeWidth={2}
        />
      )}
      {isDrawing && currentShape && currentTool === 'arrow' && (
        <g>
          <line
            x1={startPoint?.x}
            y1={startPoint?.y}
            x2={currentShape.endX}
            y2={currentShape.endY}
            stroke="#EF4444"
            strokeWidth={2}
          />
          {/* Arrow head preview */}
          {(() => {
            const angle = Math.atan2(
              (currentShape.endY || 0) - (startPoint?.y || 0),
              (currentShape.endX || 0) - (startPoint?.x || 0)
            );
            const arrowHeadLength = 15;
            return (
              <>
                <line
                  x1={currentShape.endX}
                  y1={currentShape.endY}
                  x2={currentShape.endX - arrowHeadLength * Math.cos(angle - Math.PI / 6)}
                  y2={currentShape.endY - arrowHeadLength * Math.sin(angle - Math.PI / 6)}
                  stroke="#EF4444"
                  strokeWidth={2}
                />
                <line
                  x1={currentShape.endX}
                  y1={currentShape.endY}
                  x2={currentShape.endX - arrowHeadLength * Math.cos(angle + Math.PI / 6)}
                  y2={currentShape.endY - arrowHeadLength * Math.sin(angle + Math.PI / 6)}
                  stroke="#EF4444"
                  strokeWidth={2}
                />
              </>
            );
          })()}
        </g>
      )}
      {isDrawing && currentTool === 'freehand' && freehandPoints.length > 0 && (
        <path
          d={freehandPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
          fill="none"
          stroke="#000000"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
