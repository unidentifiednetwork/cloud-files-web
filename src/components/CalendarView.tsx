"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Repeat,
  Tag,
  Trash2,
  Edit2,
  Save,
  Loader,
  AlertCircle,
  Check,
  ChevronDown,
  Grid,
  Settings
} from "lucide-react";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  addDays, 
  addMonths, 
  subMonths, 
  isSameMonth, 
  isSameDay, 
  isToday,
  parseISO, 
  addHours, 
  setHours, 
  setMinutes,
  getDay,
  startOfDay,
  endOfDay,
  differenceInMinutes,
  isWithinInterval,
  getDate,
  getMonth,
  getYear,
  addWeeks,
  subWeeks,
  isSameWeek
} from "date-fns";
import {
  initializeCalendar,
  isCalendarInitialized,
  getEventsMetadata,
  getEventsForMonth,
  getEventsForDay,
  createEvent,
  getEvent,
  updateEvent,
  deleteEvent,
  searchEvents,
  syncCalendar,
  CalendarEvent,
  CalendarEventMetadata,
  EventRepeatType,
  EVENT_COLORS
} from "@/lib/calendar";
import { getStorageConfig } from "@/lib/settings";
import { getMasterKey } from "@/lib/manifest";

interface CalendarViewProps {
  onClose?: () => void;
}

export function CalendarView({ onClose }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEventMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  
  // Event modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Event form state
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventStartDate, setEventStartDate] = useState("");
  const [eventStartTime, setEventStartTime] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [eventAllDay, setEventAllDay] = useState(false);
  const [eventColor, setEventColor] = useState("#3b82f6");
  const [eventRepeat, setEventRepeat] = useState<EventRepeatType>("none");
  const [eventRepeatEndDate, setEventRepeatEndDate] = useState("");
  const [eventTags, setEventTags] = useState("");
  
  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // UI state
  const [showYearSelector, setShowYearSelector] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(480); // Start at 8 AM

  // Initialize calendar
  const initCalendar = useCallback(async () => {
    const config = getStorageConfig();
    const masterKey = getMasterKey();
    
    if (!config || !masterKey) {
      setError("Storage not configured");
      setLoading(false);
      return;
    }

    try {
      if (!isCalendarInitialized()) {
        await initializeCalendar(config, masterKey);
      }
      setInitialized(true);
      loadEvents();
    } catch (err) {
      console.error("Failed to initialize calendar:", err);
      setError("Failed to initialize calendar");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load events for current view
  const loadEvents = useCallback(() => {
    if (!isCalendarInitialized()) return;
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const monthEvents = getEventsForMonth(year, month);
    const prevMonthEvents = getEventsForMonth(year, month - 1);
    const nextMonthEvents = getEventsForMonth(year, month + 1);
    
    const allEvents = [...prevMonthEvents, ...monthEvents, ...nextMonthEvents];
    const uniqueEvents = allEvents.filter((event, index, self) =>
      index === self.findIndex(e => e.id === event.id)
    );
    
    setEvents(uniqueEvents);
  }, [currentDate]);

  // Get week days (Sunday to Saturday)
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(currentDate);
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [currentDate]);

  // Get events for a specific day
  const getEventsByDay = useCallback((day: Date): CalendarEventMetadata[] => {
    return events.filter(event => {
      const eventStart = parseISO(event.startDate);
      const eventEnd = parseISO(event.endDate);
      return isSameDay(day, eventStart) || 
             (day >= startOfDay(eventStart) && day <= startOfDay(eventEnd));
    });
  }, [events]);

  // Get events for a specific time slot
  const getEventsForTimeSlot = useCallback((day: Date, hour: number): CalendarEventMetadata[] => {
    const slotStart = setHours(setMinutes(day, 0), hour);
    const slotEnd = addHours(slotStart, 1);
    
    return getEventsByDay(day).filter(event => {
      const eventStart = parseISO(event.startDate);
      const eventEnd = parseISO(event.endDate);
      return isWithinInterval(slotStart, { start: eventStart, end: eventEnd }) ||
             isWithinInterval(eventStart, { start: slotStart, end: slotEnd });
    });
  }, [getEventsByDay]);

  // Get all-day events for week
  const allDayEvents = useMemo(() => {
    const weekStart = startOfWeek(currentDate);
    const weekEnd = endOfWeek(currentDate);
    return events.filter(event => {
      const eventStart = parseISO(event.startDate);
      return isWithinInterval(eventStart, { start: weekStart, end: weekEnd }) && 
             (event.allDay || (parseISO(event.endDate).getTime() - eventStart.getTime()) >= 24 * 60 * 60 * 1000);
    });
  }, [currentDate, events]);

  // Get non-all-day events for week
  const timedEvents = useMemo(() => {
    return events.filter(event => !event.allDay);
  }, [events]);

  // Navigate weeks
  const goToPreviousWeek = () => setCurrentDate(addDays(currentDate, -7));
  const goToNextWeek = () => setCurrentDate(addDays(currentDate, 7));
  const goToToday = () => setCurrentDate(new Date());

  // Open event modal for creation
  const openCreateEvent = (day?: Date) => {
    const now = new Date();
    const eventDate = day || now;
    
    resetEventForm();
    setEventStartDate(format(eventDate, "yyyy-MM-dd"));
    setEventStartTime("09:00");
    setEventEndDate(format(eventDate, "yyyy-MM-dd"));
    setEventEndTime("10:00");
    setSelectedEvent(null);
    setIsEditing(false);
    setShowEventModal(true);
  };

  useEffect(() => {
    initCalendar();
  }, [initCalendar]);

  useEffect(() => {
    if (initialized) {
      loadEvents();
    }
  }, [initialized, loadEvents, currentDate]);

  // Open event modal for editing
  const openEditEvent = async (eventId: string) => {
    const config = getStorageConfig();
    if (!config) return;
    
    setLoading(true);
    try {
      const event = await getEvent(config, eventId);
      if (event) {
        setSelectedEvent(event);
        setEventTitle(event.title);
        setEventDescription(event.description);
        setEventLocation(event.location || "");
        setEventStartDate(format(parseISO(event.startDate), "yyyy-MM-dd"));
        setEventStartTime(format(parseISO(event.startDate), "HH:mm"));
        setEventEndDate(format(parseISO(event.endDate), "yyyy-MM-dd"));
        setEventEndTime(format(parseISO(event.endDate), "HH:mm"));
        setEventAllDay(event.allDay);
        setEventColor(event.color || "#3b82f6");
        setEventRepeat(event.repeat);
        setEventRepeatEndDate(event.repeatEndDate ? format(parseISO(event.repeatEndDate), "yyyy-MM-dd") : "");
        setEventTags(event.tags.join(", "));
        setIsEditing(false);
        setShowEventModal(true);
      }
    } catch (err) {
      setError("Failed to load event");
    } finally {
      setLoading(false);
    }
  };

  // Reset event form
  const resetEventForm = () => {
    setEventTitle("");
    setEventDescription("");
    setEventLocation("");
    setEventStartDate("");
    setEventStartTime("");
    setEventEndDate("");
    setEventEndTime("");
    setEventAllDay(false);
    setEventColor("#3b82f6");
    setEventRepeat("none");
    setEventRepeatEndDate("");
    setEventTags("");
    setSelectedEvent(null);
    setIsEditing(false);
  };

  // Save event
  const handleSaveEvent = async () => {
    const config = getStorageConfig();
    if (!config || !eventTitle.trim()) return;
    
    setSaving(true);
    try {
      const tags = eventTags
        .split(",")
        .map(t => t.trim())
        .filter(t => t.length > 0);
      
      const startDateTime = new Date(`${eventStartDate}T${eventStartTime}`).toISOString();
      const endDateTime = new Date(`${eventEndDate}T${eventEndTime}`).toISOString();
      
      if (selectedEvent) {
        // Update existing event
        await updateEvent(config, selectedEvent.id, {
          title: eventTitle.trim(),
          description: eventDescription,
          location: eventLocation || undefined,
          startDate: startDateTime,
          endDate: endDateTime,
          allDay: eventAllDay,
          color: eventColor,
          repeat: eventRepeat,
          repeatEndDate: eventRepeatEndDate ? new Date(`${eventRepeatEndDate}T23:59:59`).toISOString() : undefined,
          tags,
        });
      } else {
        // Create new event
        await createEvent(config, {
          title: eventTitle.trim(),
          description: eventDescription,
          location: eventLocation || undefined,
          startDate: startDateTime,
          endDate: endDateTime,
          allDay: eventAllDay,
          color: eventColor,
          repeat: eventRepeat,
          repeatEndDate: eventRepeatEndDate ? new Date(`${eventRepeatEndDate}T23:59:59`).toISOString() : undefined,
          tags,
        });
      }
      
      loadEvents();
      setShowEventModal(false);
      resetEventForm();
    } catch (err) {
      setError("Failed to save event");
    } finally {
      setSaving(false);
    }
  };

  // Delete event
  const handleDeleteEvent = async () => {
    const config = getStorageConfig();
    if (!config || !selectedEvent) return;
    
    setSaving(true);
    try {
      await deleteEvent(config, selectedEvent.id);
      loadEvents();
      setShowEventModal(false);
      resetEventForm();
    } catch (err) {
      setError("Failed to delete event");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !initialized) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <Loader className="h-8 w-8 text-white/50 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
        <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
        <p className="text-white/70">{error}</p>
        <Button
          onClick={initCalendar}
          className="mt-4"
          variant="outline"
        >
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-[#0a0a0a]">
      {/* Left Sidebar - Mini Calendar */}
      <div className="w-64 border-r border-white/[0.06] bg-[#0a0a0a] flex flex-col">
        {/* New Event Button */}
        <div className="p-4 border-b border-white/[0.06]">
          <Button
            onClick={() => openCreateEvent()}
            className="w-full h-10 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-lg"
          >
            <Plus className="h-4 w-4 mr-2" />
            New event
          </Button>
        </div>

        {/* Mini Calendar */}
        <div className="p-4 flex-1 overflow-auto">
          <div className="space-y-4">
            {/* Current Month Navigation */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">
                {format(currentDate, "MMMM yyyy")}
              </h3>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                  className="h-6 w-6 text-white/60 hover:text-white"
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                  className="h-6 w-6 text-white/60 hover:text-white"
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Mini Calendar Grid */}
            <div className="space-y-2">
              {/* Weekday headers */}
              <div className="grid grid-cols-7 gap-1">
                {["S", "M", "T", "W", "T", "F", "S"].map(day => (
                  <div key={day} className="text-xs text-white/40 text-center font-medium h-6 flex items-center justify-center">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar days */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 42 }, (_, i) => {
                  const monthStart = startOfMonth(currentDate);
                  const firstDay = startOfWeek(monthStart);
                  const day = addDays(firstDay, i);
                  const isCurrentMonth = isSameMonth(day, currentDate);
                  const isSelected = isSameDay(day, currentDate);
                  const isCurrentDay = isToday(day);
                  
                  return (
                    <button
                      key={i}
                      onClick={() => setCurrentDate(day)}
                      className={`h-8 text-xs font-medium rounded transition-colors ${
                        isSelected
                          ? "bg-sky-500 text-white"
                          : isCurrentDay
                          ? "bg-white/10 text-sky-400 border border-sky-400/30"
                          : isCurrentMonth
                          ? "text-white/80 hover:bg-white/5"
                          : "text-white/30 hover:bg-white/5"
                      }`}
                    >
                      {getDate(day)}
                    </button>
                  );
                })}
              </div>

              {/* Today button */}
              <Button
                onClick={goToToday}
                variant="outline"
                className="w-full mt-2 text-white/60 hover:text-white border-white/[0.06]"
              >
                Today
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Navigation */}
        <div className="h-14 border-b border-white/[0.06] px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={goToPreviousWeek}
              className="h-8 w-8 text-white/60 hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              onClick={goToToday}
              className="h-8 px-3 text-sm font-medium text-white/60 hover:text-white"
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={goToNextWeek}
              className="h-8 w-8 text-white/60 hover:text-white"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <div className="text-sm font-medium text-white">
              {format(weekDays[0], "MMM d")} - {format(weekDays[6], "MMM d, yyyy")}
            </div>
          </div>

          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 text-white/60 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Week View */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Day headers */}
          <div className="flex border-b border-white/[0.06] bg-[#0a0a0a] sticky top-0 z-10">
            {/* Time column header */}
            <div className="w-16 flex-shrink-0 border-r border-white/[0.06]" />
            
            {/* Day headers */}
            {weekDays.map((day, idx) => {
              const isToday_ = isToday(day);
              return (
                <div
                  key={idx}
                  className="flex-1 text-center py-3 border-r border-white/[0.06] last:border-r-0 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => openCreateEvent(day)}
                >
                  <div className="text-xs font-medium text-white/50 mb-1">
                    {format(day, "EEE")}
                  </div>
                  <div
                    className={`text-sm font-bold ${
                      isToday_
                        ? "w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center mx-auto"
                        : "text-white/80"
                    }`}
                  >
                    {format(day, "d")}
                  </div>
                </div>
              );
            })}
          </div>

          {/* All-day events section */}
          {allDayEvents.length > 0 && (
            <div className="border-b border-white/[0.06] bg-white/[0.01]">
              <div className="flex">
                {/* Time column */}
                <div className="w-16 flex-shrink-0 border-r border-white/[0.06] px-3 py-2">
                  <div className="text-xs text-white/40 font-medium">All day</div>
                </div>
                
                {/* All-day events grid */}
                <div className="flex-1 flex">
                  {weekDays.map((day, dayIdx) => {
                    const dayAllDayEvents = allDayEvents.filter(event => {
                      const eventStart = parseISO(event.startDate);
                      return isSameDay(day, eventStart);
                    });
                    
                    return (
                      <div
                        key={dayIdx}
                        className="flex-1 border-r border-white/[0.06] last:border-r-0 px-2 py-2"
                      >
                        {dayAllDayEvents.map(event => (
                          <button
                            key={event.id}
                            onClick={() => openEditEvent(event.id)}
                            className="w-full px-2 py-1.5 rounded text-left text-xs font-medium transition-colors hover:opacity-80 truncate"
                            style={{
                              backgroundColor: `${event.color || "#3b82f6"}30`,
                              color: event.color || "#3b82f6",
                              borderLeft: `2px solid ${event.color || "#3b82f6"}`,
                            }}
                            title={event.title}
                          >
                            {event.title}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Time grid */}
          <div className="flex-1 overflow-auto">
            <div className="flex">
              {/* Time column */}
              <div className="w-16 flex-shrink-0 border-r border-white/[0.06]">
                {Array.from({ length: 24 }, (_, i) => (
                  <div
                    key={i}
                    className="h-12 text-right pr-3 text-xs text-white/40 flex items-start pt-1 border-b border-white/[0.03] font-medium"
                  >
                    {format(setHours(new Date(), i), "HH:mm")}
                  </div>
                ))}
              </div>

              {/* Days grid */}
              {weekDays.map((day, dayIdx) => (
                <div
                  key={dayIdx}
                  className="flex-1 border-r border-white/[0.06] last:border-r-0 relative"
                >
                  {Array.from({ length: 24 }, (_, hour) => {
                    const slotStart = setHours(setMinutes(day, 0), hour);
                    const slotEnd = addHours(slotStart, 1);
                    const slotEvents = timedEvents.filter(event => {
                      const eventStart = parseISO(event.startDate);
                      const eventEnd = parseISO(event.endDate);
                      return isWithinInterval(slotStart, { start: eventStart, end: eventEnd }) ||
                             isWithinInterval(eventStart, { start: slotStart, end: slotEnd });
                    });

                    return (
                      <div
                        key={`${dayIdx}-${hour}`}
                        onClick={() => openCreateEvent(slotStart)}
                        className="h-12 border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer transition-colors relative group"
                      >
                        {slotEvents.length > 0 && (
                          <div className="absolute inset-0 p-0.5 space-y-0.5 overflow-hidden">
                            {slotEvents.map((event) => {
                              const eventStart = parseISO(event.startDate);
                              const eventEnd = parseISO(event.endDate);
                              
                              // Calculate position and height
                              const startInSlot = Math.max(0, differenceInMinutes(eventStart, slotStart));
                              const durationInSlot = Math.min(
                                60,
                                differenceInMinutes(eventEnd, slotStart) - startInSlot
                              );
                              
                              if (durationInSlot <= 0) return null;
                              
                              return (
                                <button
                                  key={event.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditEvent(event.id);
                                  }}
                                  className="w-full text-left text-xs px-1.5 py-0.5 rounded truncate transition-opacity hover:opacity-80 font-medium"
                                  style={{
                                    backgroundColor: `${event.color || "#3b82f6"}40`,
                                    color: event.color || "#3b82f6",
                                    borderLeft: `3px solid ${event.color || "#3b82f6"}`,
                                    height: `${Math.max(20, (durationInSlot / 60) * 100)}%`,
                                  }}
                                  title={event.title}
                                >
                                  {event.title}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setShowEventModal(false);
              setShowDeleteConfirm(false);
            }}
          />
          
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[#141414] rounded-xl border border-white/[0.06] shadow-xl">
            {/* Modal Header */}
            <div className="sticky top-0 bg-[#141414] px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                {selectedEvent && !isEditing ? "Event Details" : selectedEvent ? "Edit Event" : "New Event"}
              </h3>
              <div className="flex items-center gap-2">
                {selectedEvent && !isEditing && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsEditing(true)}
                      className="h-8 w-8 text-white/60 hover:text-white"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="h-8 w-8 text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowEventModal(false);
                    setShowDeleteConfirm(false);
                  }}
                  className="h-8 w-8 text-white/60 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-4">
              {/* Delete Confirmation */}
              {showDeleteConfirm ? (
                <div className="space-y-4">
                  <p className="text-white/70">Are you sure you want to delete this event?</p>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleDeleteEvent}
                      disabled={saving}
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                    >
                      {saving ? <Loader className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                      Delete
                    </Button>
                    <Button
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={saving}
                      variant="outline"
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : selectedEvent && !isEditing ? (
                // View mode
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-white/50 mb-1">Title</h4>
                    <p className="text-white">{selectedEvent.title}</p>
                  </div>
                  
                  {selectedEvent.description && (
                    <div>
                      <h4 className="text-sm font-medium text-white/50 mb-1">Description</h4>
                      <p className="text-white/70 text-sm">{selectedEvent.description}</p>
                    </div>
                  )}

                  <div>
                    <h4 className="text-sm font-medium text-white/50 mb-1">Date & Time</h4>
                    <p className="text-white/70 text-sm">
                      {selectedEvent.allDay ? "All day" : format(parseISO(selectedEvent.startDate), "PPpp")}
                      {!selectedEvent.allDay && ` - ${format(parseISO(selectedEvent.endDate), "HH:mm")}`}
                    </p>
                  </div>

                  {selectedEvent.location && (
                    <div>
                      <h4 className="text-sm font-medium text-white/50 mb-1">Location</h4>
                      <p className="text-white/70 text-sm flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        {selectedEvent.location}
                      </p>
                    </div>
                  )}

                  {selectedEvent.repeat !== "none" && (
                    <div>
                      <h4 className="text-sm font-medium text-white/50 mb-1">Recurrence</h4>
                      <p className="text-white/70 text-sm flex items-center gap-2">
                        <Repeat className="h-4 w-4" />
                        {selectedEvent.repeat}
                      </p>
                    </div>
                  )}

                  {selectedEvent.tags.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-white/50 mb-2">Tags</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedEvent.tags.map(tag => (
                          <span key={tag} className="px-2 py-1 text-xs bg-white/10 text-white/80 rounded-full flex items-center gap-1">
                            <Tag className="h-3 w-3" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // Edit mode
                <form className="space-y-4">
                  {/* Title */}
                  <div>
                    <Label className="text-xs text-white/50 mb-1.5 block">Title *</Label>
                    <Input
                      value={eventTitle}
                      onChange={(e) => setEventTitle(e.target.value)}
                      placeholder="Event title"
                      className="bg-white/[0.03] border-white/[0.06] text-white placeholder:text-white/30"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <Label className="text-xs text-white/50 mb-1.5 block">Description</Label>
                    <textarea
                      value={eventDescription}
                      onChange={(e) => setEventDescription(e.target.value)}
                      placeholder="Event description..."
                      className="w-full h-20 px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-lg text-white placeholder:text-white/30 resize-none"
                    />
                  </div>

                  {/* Location */}
                  <div>
                    <Label className="text-xs text-white/50 mb-1.5 block flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Location
                    </Label>
                    <Input
                      value={eventLocation}
                      onChange={(e) => setEventLocation(e.target.value)}
                      placeholder="Location"
                      className="bg-white/[0.03] border-white/[0.06] text-white placeholder:text-white/30"
                    />
                  </div>

                  {/* Dates and Times */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-white/50 mb-1.5 block">Start Date</Label>
                      <Input
                        type="date"
                        value={eventStartDate}
                        onChange={(e) => setEventStartDate(e.target.value)}
                        className="bg-white/[0.03] border-white/[0.06] text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-white/50 mb-1.5 block">Start Time</Label>
                      <Input
                        type="time"
                        value={eventStartTime}
                        onChange={(e) => setEventStartTime(e.target.value)}
                        disabled={eventAllDay}
                        className="bg-white/[0.03] border-white/[0.06] text-white disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-white/50 mb-1.5 block">End Date</Label>
                      <Input
                        type="date"
                        value={eventEndDate}
                        onChange={(e) => setEventEndDate(e.target.value)}
                        className="bg-white/[0.03] border-white/[0.06] text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-white/50 mb-1.5 block">End Time</Label>
                      <Input
                        type="time"
                        value={eventEndTime}
                        onChange={(e) => setEventEndTime(e.target.value)}
                        disabled={eventAllDay}
                        className="bg-white/[0.03] border-white/[0.06] text-white disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {/* All day toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={eventAllDay}
                      onChange={(e) => setEventAllDay(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm text-white/70">All day event</span>
                  </label>

                  {/* Color picker */}
                  <div>
                    <Label className="text-xs text-white/50 mb-1.5 block">Color</Label>
                    <div className="flex gap-2 flex-wrap">
                      {EVENT_COLORS.map(color => (
                        <button
                          key={color.value}
                          type="button"
                          onClick={() => setEventColor(color.value)}
                          className={`w-8 h-8 rounded-full transition-transform ${
                            eventColor === color.value ? "ring-2 ring-offset-2 ring-offset-[#141414] scale-110" : "hover:scale-110"
                          }`}
                          style={{ backgroundColor: color.value }}
                          title={color.name}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Repeat */}
                  <div>
                    <Label className="text-xs text-white/50 mb-1.5 block flex items-center gap-1">
                      <Repeat className="h-3 w-3" /> Repeat
                    </Label>
                    <select
                      value={eventRepeat}
                      onChange={(e) => setEventRepeat(e.target.value as EventRepeatType)}
                      className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-lg text-white"
                    >
                      <option value="none">None</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>

                  {eventRepeat !== "none" && (
                    <div>
                      <Label className="text-xs text-white/50 mb-1.5 block">Repeat Until</Label>
                      <Input
                        type="date"
                        value={eventRepeatEndDate}
                        onChange={(e) => setEventRepeatEndDate(e.target.value)}
                        className="bg-white/[0.03] border-white/[0.06] text-white"
                      />
                    </div>
                  )}

                  {/* Tags */}
                  <div>
                    <Label className="text-xs text-white/50 mb-1.5 block flex items-center gap-1">
                      <Tag className="h-3 w-3" /> Tags
                    </Label>
                    <Input
                      value={eventTags}
                      onChange={(e) => setEventTags(e.target.value)}
                      placeholder="Comma-separated tags"
                      className="bg-white/[0.03] border-white/[0.06] text-white placeholder:text-white/30"
                    />
                  </div>

                  {/* Save button */}
                  <Button
                    onClick={handleSaveEvent}
                    disabled={saving || !eventTitle.trim()}
                    className="w-full bg-sky-500 hover:bg-sky-600 text-white"
                  >
                    {saving ? (
                      <>
                        <Loader className="h-4 w-4 animate-spin mr-2" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Event
                      </>
                    )}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
