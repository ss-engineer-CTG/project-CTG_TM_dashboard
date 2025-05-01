import React, { useState, useEffect } from "react";
import { ZoomIn, ZoomOut, Calendar } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { Project, Milestone, MilestoneStatus } from "../types/models";
import { getMilestoneTimeline } from "../services/api";
import { useNotification } from "../contexts/NotificationContext";

// MilestoneTimelineコンポーネントのプロパティ
interface MilestoneTimelineProps {
  filePath?: string;
  onRefresh?: () => void;
}

// Helper function to get status color
const getStatusColor = (status: MilestoneStatus): string => {
  switch (status) {
    case "completed":
      return "#50ff96"; // bg-green-500
    case "in-progress":
      return "#60cdff"; // bg-blue-500
    case "delayed":
      return "#ff5f5f"; // bg-red-500
    case "not-started":
    default:
      return "#c8c8c8"; // bg-gray-300
  }
};

// Helper function to get status border color
const getStatusBorderColor = (status: MilestoneStatus): string => {
  switch (status) {
    case "completed":
      return "border-green-500";
    case "in-progress":
      return "border-blue-500";
    case "delayed":
      return "border-red-500";
    case "not-started":
    default:
      return "border-gray-300";
  }
};

// Helper function to format date
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// Calculate the position of a milestone on the timeline
const calculatePosition = (date: Date, startDate: Date, endDate: Date, width: number): number => {
  const totalDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  const daysPassed = (date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  return (daysPassed / totalDays) * width;
};

export const MilestoneTimeline: React.FC<MilestoneTimelineProps> = ({ filePath, onRefresh }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [timelineWidth, setTimelineWidth] = useState<number>(1000);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [viewStartDate, setViewStartDate] = useState<Date>(new Date());
  const [viewEndDate, setViewEndDate] = useState<Date>(new Date());
  const [viewType, setViewType] = useState<"month" | "week">("month");
  
  const { addNotification } = useNotification();
  
  // APIからデータを取得
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const timelineData = await getMilestoneTimeline(filePath);
        
        if (timelineData.projects && timelineData.projects.length > 0) {
          setProjects(timelineData.projects);
          
          // すべてのプロジェクトを初期選択
          setSelectedProjects(timelineData.projects.map(project => project.project_id));
          
          // 初期表示期間を設定
          const allDates: Date[] = [];
          
          timelineData.projects.forEach(project => {
            allDates.push(new Date(project.start_date));
            allDates.push(new Date(project.end_date));
            
            if (project.milestones) {
              project.milestones.forEach(milestone => {
                allDates.push(new Date(milestone.planned_date));
                if (milestone.actual_date) {
                  allDates.push(new Date(milestone.actual_date));
                }
              });
            }
          });
          
          if (allDates.length > 0) {
            // 最も早い日付と最も遅い日付を取得
            const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
            const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
            
            // 前後1ヶ月の余裕を持たせる
            minDate.setMonth(minDate.getMonth() - 1);
            maxDate.setMonth(maxDate.getMonth() + 1);
            
            setViewStartDate(minDate);
            setViewEndDate(maxDate);
          } else {
            // デフォルト範囲を設定
            const now = new Date();
            const threeMonthsBefore = new Date();
            threeMonthsBefore.setMonth(now.getMonth() - 3);
            
            const threeMonthsAfter = new Date();
            threeMonthsAfter.setMonth(now.getMonth() + 3);
            
            setViewStartDate(threeMonthsBefore);
            setViewEndDate(threeMonthsAfter);
          }
        }
      } catch (err) {
        console.error("マイルストーンデータの取得に失敗しました", err);
        setError(err instanceof Error ? err : new Error('データの取得に失敗しました'));
        addNotification("マイルストーンデータの取得に失敗しました", "error");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [filePath, addNotification]);
  
  // ズーム処理
  const handleZoomIn = () => {
    if (zoomLevel < 3) {
      setZoomLevel(zoomLevel + 0.5);
      setTimelineWidth(timelineWidth * 1.5);
    }
  };
  
  const handleZoomOut = () => {
    if (zoomLevel > 0.5) {
      setZoomLevel(zoomLevel - 0.5);
      setTimelineWidth(timelineWidth / 1.5);
    }
  };
  
  // Reset to today
  const resetToToday = () => {
    const today = new Date();
    const threeMonthsBefore = new Date(today);
    threeMonthsBefore.setMonth(today.getMonth() - 3);

    const threeMonthsAfter = new Date(today);
    threeMonthsAfter.setMonth(today.getMonth() + 3);

    setViewStartDate(threeMonthsBefore);
    setViewEndDate(threeMonthsAfter);
  };
  
  // プロジェクト選択切り替え
  const toggleProjectSelection = (projectId: string) => {
    if (selectedProjects.includes(projectId)) {
      setSelectedProjects(selectedProjects.filter((id) => id !== projectId));
    } else {
      setSelectedProjects([...selectedProjects, projectId]);
    }
  };
  
  // 選択されたプロジェクトをフィルタリング
  const filteredProjects = projects.filter((project) => selectedProjects.includes(project.project_id));
  
  // Generate time markers (months or weeks)
  const generateTimeMarkers = () => {
    const markers = [];
    const currentDate = new Date(viewStartDate);

    if (viewType === "month") {
      // ズームレベルに基づいて月の間隔を決定
      const monthInterval = zoomLevel < 0.8 ? 3 : zoomLevel < 1.2 ? 2 : 1;

      while (currentDate <= viewEndDate) {
        const position = calculatePosition(currentDate, viewStartDate, viewEndDate, timelineWidth);

        // 月の間隔に基づいて表示するかどうかを決定
        if (currentDate.getMonth() % monthInterval === 0) {
          markers.push(
            <div
              key={currentDate.toISOString()}
              className="absolute border-l border-gray-600 h-6"
              style={{ left: `${position}px` }}
            >
              <div className="text-xs text-text-secondary px-1 py-0.5 rounded bg-surface bg-opacity-80 transform -translate-x-1/2 mt-1 whitespace-nowrap">
                {currentDate.toLocaleDateString("ja-JP", { year: "numeric", month: "short" })}
              </div>
            </div>,
          );
        }

        // Move to next month
        const newDate = new Date(currentDate);
        newDate.setMonth(newDate.getMonth() + 1);
        currentDate.setTime(newDate.getTime());
      }
    } else {
      // 週単位のマーカーを生成
      // 最初の日を週の始めに調整
      currentDate.setDate(currentDate.getDate() - currentDate.getDay());

      // ズームレベルに基づいて週の間隔を決定
      const weekInterval = zoomLevel < 0.8 ? 4 : zoomLevel < 1.2 ? 2 : 1;

      let weekCounter = 0;
      while (currentDate <= viewEndDate) {
        const position = calculatePosition(currentDate, viewStartDate, viewEndDate, timelineWidth);

        // 週の間隔に基づいて表示するかどうかを決定
        if (weekCounter % weekInterval === 0) {
          const weekEnd = new Date(currentDate);
          weekEnd.setDate(weekEnd.getDate() + 6);

          markers.push(
            <div
              key={currentDate.toISOString()}
              className="absolute border-l border-gray-200 h-6"
              style={{ left: `${position}px` }}
            >
              <div className="text-xs text-gray-500 transform -translate-x-1/2 mt-1 whitespace-nowrap">
                {`${currentDate.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}〜${weekEnd.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}`}
              </div>
            </div>,
          );
        }

        // Move to next week
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + 7);
        currentDate.setTime(newDate.getTime());
        weekCounter++;
      }
    }

    return markers;
  };
  
  // Generate vertical grid lines for the timeline content
  const generateGridLines = () => {
    const gridLines = [];
    const currentDate = new Date(viewStartDate);

    if (viewType === "month") {
      // ズームレベルに基づいて月の間隔を決定
      const monthInterval = zoomLevel < 0.8 ? 3 : zoomLevel < 1.2 ? 2 : 1;

      while (currentDate <= viewEndDate) {
        const position = calculatePosition(currentDate, viewStartDate, viewEndDate, timelineWidth);

        // 月の間隔に基づいて表示するかどうかを決定
        if (currentDate.getMonth() % monthInterval === 0) {
          gridLines.push(
            <div
              key={currentDate.toISOString()}
              className="absolute top-0 h-full border-l border-gray-200"
              style={{ left: `${position}px` }}
            />,
          );
        }

        // Move to next month
        const newDate = new Date(currentDate);
        newDate.setMonth(newDate.getMonth() + 1);
        currentDate.setTime(newDate.getTime());
      }
    } else {
      // 週単位のグリッドラインを生成
      currentDate.setDate(currentDate.getDate() - currentDate.getDay());
      const weekInterval = zoomLevel < 0.8 ? 4 : zoomLevel < 1.2 ? 2 : 1;
      let weekCounter = 0;

      while (currentDate <= viewEndDate) {
        const position = calculatePosition(currentDate, viewStartDate, viewEndDate, timelineWidth);

        if (weekCounter % weekInterval === 0) {
          gridLines.push(
            <div
              key={currentDate.toISOString()}
              className="absolute top-0 h-full border-l border-gray-200"
              style={{ left: `${position}px` }}
            />,
          );
        }

        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + 7);
        currentDate.setTime(newDate.getTime());
        weekCounter++;
      }
    }

    return gridLines;
  };
  
  // Today marker
  const renderTodayMarker = () => {
    const today = new Date();

    // Only show if today is within the view range
    if (today >= viewStartDate && today <= viewEndDate) {
      const position = calculatePosition(today, viewStartDate, viewEndDate, timelineWidth);

      return (
        <div className="absolute h-full border-l-2 border-red-500 z-10" style={{ left: `${position}px` }}>
          <div className="text-xs text-red-500 -ml-6 mt-1">今日</div>
        </div>
      );
    }

    return null;
  };
  
  // ローディング表示
  if (isLoading) {
    return (
      <div className="w-full p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-700 rounded w-1/4"></div>
          <div className="h-32 bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }
  
  // エラー表示
  if (error) {
    return (
      <div className="w-full p-4">
        <div className="text-red-500">
          <h3 className="font-bold">エラーが発生しました</h3>
          <p>{error.message}</p>
        </div>
      </div>
    );
  }
  
  // データがない場合
  if (projects.length === 0) {
    return (
      <div className="w-full p-4">
        <div className="text-text-secondary text-center">
          <h3 className="font-bold">データがありません</h3>
          <p>マイルストーンが設定されているプロジェクトがありません</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="w-full space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">マイルストーン進捗タイムライン</h2>
        <div className="flex space-x-2">
          <Button variant="outline" size="sm" onClick={handleZoomOut}>
            <ZoomOut className="h-4 w-4 mr-1" />
            縮小
          </Button>
          <Button variant="outline" size="sm" onClick={handleZoomIn}>
            <ZoomIn className="h-4 w-4 mr-1" />
            拡大
          </Button>
          <Button variant="outline" size="sm" onClick={resetToToday}>
            <Calendar className="h-4 w-4 mr-1" />
            今日
          </Button>
          <div className="border-l mx-2 h-6"></div>
          <Button variant={viewType === "month" ? "default" : "outline"} size="sm" onClick={() => setViewType("month")}>
            月表示
          </Button>
          <Button variant={viewType === "week" ? "default" : "outline"} size="sm" onClick={() => setViewType("week")}>
            週表示
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {projects.map((project) => (
          <Badge
            key={project.project_id}
            variant={selectedProjects.includes(project.project_id) ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => toggleProjectSelection(project.project_id)}
          >
            {project.project_name}
          </Badge>
        ))}
      </div>

      <div className="flex space-x-4 mb-4">
        <div className="flex items-center">
          <div className="w-3 h-3 rounded-full bg-status-success mr-2"></div>
          <span className="text-sm">完了</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 rounded-full bg-status-info mr-2"></div>
          <span className="text-sm">進行中</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 rounded-full bg-gray-300 mr-2"></div>
          <span className="text-sm">未着手</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 rounded-full bg-status-danger mr-2"></div>
          <span className="text-sm">遅延</span>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          {/* ここから修正: 一つのスクロール領域の中にスティッキーコンテンツを配置 */}
          <div className="overflow-auto h-[500px]">
            <div style={{ width: `${timelineWidth + 192}px` }}>
              {/* ヘッダー部分 */}
              <div className="flex mb-2">
                {/* 左上の空白セル（プロジェクト名カラムの上） - スティッキー */}
                <div className="w-48 flex-shrink-0 sticky left-0 z-20 bg-surface"></div>
                
                {/* 右上の日付マーカーエリア */}
                <div className="relative flex-grow">
                  <div className="relative h-8 bg-surface-light" style={{ width: `${timelineWidth}px` }}>
                    {generateTimeMarkers()}
                  </div>
                </div>
              </div>

              {/* メインコンテンツ部分 */}
              {filteredProjects.map((project, projectIndex) => (
                <div key={project.project_id} className="flex mb-12 hover:bg-gray-800 hover:bg-opacity-10">
                  {/* プロジェクト名 - スティッキー適用 */}
                  <div 
                    className="w-48 sticky left-0 z-10 bg-surface flex-shrink-0 pt-2 border-r border-gray-200"
                    style={{ 
                      height: '120px',
                      backgroundColor: projectIndex % 2 === 0 ? 'var(--surface-color)' : 'var(--surface-light, #3d3d3d)'
                    }}
                  >
                    <div className="font-medium p-2">{project.project_name}</div>
                  </div>
                  
                  {/* タイムライン部分 */}
                  <div className="relative" style={{ width: `${timelineWidth}px`, height: '120px' }}>
                    <div 
                      className="h-16 rounded-lg relative mt-2"
                      style={{ backgroundColor: projectIndex % 2 === 0 ? 'rgba(75, 75, 75, 0.1)' : 'rgba(100, 100, 100, 0.1)' }}
                    >
                      {/* Grid lines */}
                      {generateGridLines()}
                      
                      {/* Today marker */}
                      {renderTodayMarker()}
                      
                      {/* Timeline base */}
                      <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-200 transform -translate-y-1/2"></div>
                      
                      {/* Milestones */}
                      {project.milestones && project.milestones.map((milestone) => {
                        const plannedDate = new Date(milestone.planned_date);
                        const position = calculatePosition(
                          plannedDate,
                          viewStartDate,
                          viewEndDate,
                          timelineWidth,
                        );
                        
                        // Calculate actual position if available
                        const actualPosition = milestone.actual_date
                          ? calculatePosition(new Date(milestone.actual_date), viewStartDate, viewEndDate, timelineWidth)
                          : null;
                          
                        return (
                          <TooltipProvider key={milestone.id}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="absolute" style={{ left: `${position}px`, top: "50%" }}>
                                  {/* Planned milestone marker */}
                                  <div
                                    className={`w-6 h-6 rounded-full border-2 ${getStatusBorderColor(
                                      milestone.status,
                                    )} flex items-center justify-center transform -translate-x-1/2 -translate-y-1/2 bg-white`}
                                  >
                                    {milestone.status === "completed" && (
                                      <div className="w-3 h-3 rounded-full bg-status-success"></div>
                                    )}
                                    {milestone.status === "in-progress" && (
                                      <div className="w-3 h-3 rounded-full bg-status-info"></div>
                                    )}
                                    {milestone.status === "delayed" && (
                                      <div className="w-3 h-3 rounded-full bg-status-danger"></div>
                                    )}
                                  </div>

                                  {/* Milestone name */}
                                  <div
                                    className="text-xs font-medium mt-1 whitespace-nowrap"
                                    style={{ marginLeft: "-50%" }}
                                  >
                                    {milestone.name}
                                  </div>

                                  {/* Actual date marker (if different from planned) */}
                                  {actualPosition !== null && Math.abs(actualPosition - position) > 2 && (
                                    <>
                                      <div
                                        className="absolute top-0 w-4 h-4 rounded-full bg-red-500 transform -translate-x-1/2 -translate-y-1/2"
                                        style={{ left: `${actualPosition - position}px` }}
                                      ></div>
                                      <div
                                        className="absolute top-0 border-t-2 border-dashed border-red-400"
                                        style={{
                                          left: position < actualPosition ? "0" : `${actualPosition - position}px`,
                                          width: `${Math.abs(actualPosition - position)}px`,
                                          top: "50%",
                                        }}
                                      ></div>
                                    </>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <div className="space-y-1">
                                  <div className="font-bold">{milestone.name}</div>
                                  <div>{milestone.description}</div>
                                  <div className="text-sm">計画日: {formatDate(milestone.planned_date)}</div>
                                  {milestone.actual_date && (
                                    <div className="text-sm">実績日: {formatDate(milestone.actual_date)}</div>
                                  )}
                                  <div className="text-sm">担当: {milestone.owner}</div>
                                  <div className="flex items-center mt-1">
                                    <div
                                      className="w-3 h-3 rounded-full mr-2"
                                      style={{ backgroundColor: getStatusColor(milestone.status) }}
                                    ></div>
                                    <span>
                                      {milestone.status === "completed"
                                        ? "完了"
                                        : milestone.status === "in-progress"
                                          ? "進行中"
                                          : milestone.status === "delayed"
                                            ? "遅延"
                                            : "未着手"}
                                    </span>
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })}

                      {/* Dependencies (arrows between milestones) */}
                      {project.milestones && project.milestones
                        .filter((milestone) => milestone.dependencies && milestone.dependencies.length > 0)
                        .map((milestone) => {
                          const targetPosition = calculatePosition(
                            new Date(milestone.planned_date),
                            viewStartDate,
                            viewEndDate,
                            timelineWidth,
                          );

                          return milestone.dependencies?.map((depId) => {
                            const sourceMilestone = project.milestones?.find((m) => m.id === depId);
                            if (!sourceMilestone) return null;

                            const sourcePosition = calculatePosition(
                              new Date(sourceMilestone.planned_date),
                              viewStartDate,
                              viewEndDate,
                              timelineWidth,
                            );

                            return (
                              <svg
                                key={`${milestone.id}-${depId}`}
                                className="absolute top-1/2 pointer-events-none"
                                style={{
                                  left: `${sourcePosition}px`,
                                  width: `${targetPosition - sourcePosition}px`,
                                  height: "10px",
                                  transform: "translateY(-50%)",
                                }}
                              >
                                <defs>
                                  <marker
                                    id={`arrowhead-${milestone.id}-${depId}`}
                                    markerWidth="10"
                                    markerHeight="7"
                                    refX="0"
                                    refY="3.5"
                                    orient="auto"
                                  >
                                    <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
                                  </marker>
                                </defs>
                                <line
                                  x1="0"
                                  y1="5"
                                  x2={targetPosition - sourcePosition - 10}
                                  y2="5"
                                  stroke="#94a3b8"
                                  strokeWidth="1"
                                  strokeDasharray="4"
                                  markerEnd={`url(#arrowhead-${milestone.id}-${depId})`}
                                />
                              </svg>
                            );
                          });
                        })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* ここまで修正 */}
        </CardContent>
      </Card>
    </div>
  );
};

export default MilestoneTimeline;