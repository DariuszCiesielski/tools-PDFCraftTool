/**
 * GuidedTour Component
 * Requirements: 10.5
 * 
 * Provides a guided tour for first-time users with step-by-step tooltips
 */

'use client';

import React, { useEffect, useState, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';
import { useGuidedTour, type TourStep } from '@/lib/hooks/useGuidedTour';
import { Button } from '@/components/ui/Button';

export interface GuidedTourProps {
  steps: TourStep[];
  translations: {
    startTour: string;
    next: string;
    prev: string;
    finish: string;
    skip: string;
    stepOf: string;
    welcomeTitle: string;
    welcomeMessage: string;
  };
  autoStart?: boolean;
}

interface TooltipPosition {
  top: number;
  left: number;
  placement: 'top' | 'bottom' | 'left' | 'right';
}

export const GuidedTour: React.FC<GuidedTourProps> = ({
  steps,
  translations,
  autoStart = false,
}) => {
  const {
    isActive,
    currentStep,
    currentStepData,
    totalSteps,
    isFirstVisit,
    startTour,
    nextStep,
    prevStep,
    endTour,
    dismissTour,
  } = useGuidedTour(steps);

  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  // Show welcome dialog for first-time visitors
  useEffect(() => {
    if (isFirstVisit && autoStart) {
      setShowWelcome(true);
    }
  }, [isFirstVisit, autoStart]);

  // Calculate tooltip position when step changes
  useEffect(() => {
    if (!isActive || !currentStepData) {
      setTooltipPosition(null);
      setTargetRect(null);
      return;
    }

    const calculatePosition = () => {
      const target = document.querySelector(currentStepData.target);
      if (!target) {
        setTooltipPosition(null);
        setTargetRect(null);
        return;
      }

      const rect = target.getBoundingClientRect();
      setTargetRect(rect);

      const tooltipWidth = 320;
      const tooltipHeight = 200;
      const margin = 12;

      let placement = currentStepData.placement || 'bottom';
      let top = 0;
      let left = 0;

      // Calculate position based on placement
      switch (placement) {
        case 'top':
          top = rect.top - tooltipHeight - margin;
          left = rect.left + rect.width / 2 - tooltipWidth / 2;
          break;
        case 'bottom':
          top = rect.bottom + margin;
          left = rect.left + rect.width / 2 - tooltipWidth / 2;
          break;
        case 'left':
          top = rect.top + rect.height / 2 - tooltipHeight / 2;
          left = rect.left - tooltipWidth - margin;
          break;
        case 'right':
          top = rect.top + rect.height / 2 - tooltipHeight / 2;
          left = rect.right + margin;
          break;
      }

      // Adjust if tooltip goes off screen
      if (left < margin) left = margin;
      if (left + tooltipWidth > window.innerWidth - margin) {
        left = window.innerWidth - tooltipWidth - margin;
      }
      if (top < margin) {
        top = rect.bottom + margin;
        placement = 'bottom';
      }
      if (top + tooltipHeight > window.innerHeight - margin) {
        top = rect.top - tooltipHeight - margin;
        placement = 'top';
      }

      setTooltipPosition({ top, left, placement });

      // Scroll target into view if needed
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    calculatePosition();
    window.addEventListener('resize', calculatePosition);
    window.addEventListener('scroll', calculatePosition);

    return () => {
      window.removeEventListener('resize', calculatePosition);
      window.removeEventListener('scroll', calculatePosition);
    };
  }, [isActive, currentStepData, currentStep]);

  const handleStartTour = () => {
    setShowWelcome(false);
    startTour();
  };

  const handleSkipWelcome = () => {
    setShowWelcome(false);
    dismissTour();
  };

  // Welcome dialog for first-time users
  if (showWelcome) {
    return (
      <>
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50 z-[9998]" />
        
        {/* Welcome Dialog */}
        <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4">
          <div className="bg-[hsl(var(--color-background))] rounded-[var(--radius-lg)] shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-[hsl(var(--color-primary))]/10">
                <HelpCircle className="h-6 w-6 text-[hsl(var(--color-primary))]" />
              </div>
              <h2 className="text-xl font-semibold text-[hsl(var(--color-foreground))]">
                {translations.welcomeTitle}
              </h2>
            </div>
            <p className="text-[hsl(var(--color-muted-foreground))] mb-6">
              {translations.welcomeMessage}
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={handleSkipWelcome}>
                {translations.skip}
              </Button>
              <Button variant="primary" onClick={handleStartTour}>
                {translations.startTour}
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!isActive || !currentStepData || !tooltipPosition) {
    return null;
  }

  const isLastStep = currentStep === totalSteps - 1;
  const isFirstStep = currentStep === 0;

  return (
    <>
      {/* Backdrop with spotlight */}
      <div className="fixed inset-0 z-[9998] pointer-events-none">
        <svg className="w-full h-full">
          <defs>
            <mask id="spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {targetRect && (
                <rect
                  x={targetRect.left - 8}
                  y={targetRect.top - 8}
                  width={targetRect.width + 16}
                  height={targetRect.height + 16}
                  rx="8"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0, 0, 0, 0.5)"
            mask="url(#spotlight-mask)"
          />
        </svg>
      </div>

      {/* Highlight border around target */}
      {targetRect && (
        <div
          className="fixed z-[9999] pointer-events-none border-2 border-[hsl(var(--color-primary))] rounded-[var(--radius-md)] transition-all duration-300"
          style={{
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="fixed z-[10000] w-80 bg-[hsl(var(--color-background))] rounded-[var(--radius-lg)] shadow-xl border border-[hsl(var(--color-border))] transition-all duration-300"
        style={{
          top: tooltipPosition.top,
          left: tooltipPosition.left,
        }}
      >
        {/* Close button */}
        <button
          onClick={endTour}
          className="absolute top-2 right-2 p-1 text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))] transition-colors"
          aria-label="Close tour"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        {/* Content */}
        <div className="p-4">
          <h3 className="font-semibold text-[hsl(var(--color-foreground))] mb-2 pr-6">
            {currentStepData.title}
          </h3>
          <p className="text-sm text-[hsl(var(--color-muted-foreground))] mb-4">
            {currentStepData.content}
          </p>

          {/* Progress and navigation */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[hsl(var(--color-muted-foreground))]">
              {currentStep + 1} {translations.stepOf} {totalSteps}
            </span>
            <div className="flex gap-2">
              {!isFirstStep && (
                <Button variant="ghost" size="sm" onClick={prevStep}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  {translations.prev}
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={nextStep}>
                {isLastStep ? translations.finish : translations.next}
                {!isLastStep && <ChevronRight className="h-4 w-4 ml-1" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Progress dots */}
        <div 
          className="flex justify-center gap-1 pb-3"
          role="tablist"
          aria-label="Tour progress"
        >
          {steps.map((step, index) => (
            <button
              key={index}
              type="button"
              role="tab"
              aria-selected={index === currentStep}
              aria-label={`Step ${index + 1}: ${step.title}`}
              tabIndex={index === currentStep ? 0 : -1}
              onClick={() => {
                // Navigate to specific step
                if (index < currentStep) {
                  for (let i = currentStep; i > index; i--) {
                    prevStep();
                  }
                } else if (index > currentStep) {
                  for (let i = currentStep; i < index; i++) {
                    nextStep();
                  }
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (currentStep < totalSteps - 1) {
                    nextStep();
                  }
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (currentStep > 0) {
                    prevStep();
                  }
                } else if (e.key === 'Home') {
                  e.preventDefault();
                  for (let i = currentStep; i > 0; i--) {
                    prevStep();
                  }
                } else if (e.key === 'End') {
                  e.preventDefault();
                  for (let i = currentStep; i < totalSteps - 1; i++) {
                    nextStep();
                  }
                }
              }}
              className={`w-2 h-2 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-ring))] focus-visible:ring-offset-1 ${
                index === currentStep
                  ? 'bg-[hsl(var(--color-primary))]'
                  : 'bg-[hsl(var(--color-muted))] hover:bg-[hsl(var(--color-muted-foreground))]'
              }`}
            />
          ))}
        </div>
      </div>
    </>
  );
};

export default GuidedTour;
