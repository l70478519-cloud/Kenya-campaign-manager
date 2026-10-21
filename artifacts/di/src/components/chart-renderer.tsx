import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AnswerData } from "@/lib/api";

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function ChartRenderer({ answer }: { answer: AnswerData }) {
  if (answer.status !== "answered" || !answer.chartData || !answer.chartType || !answer.chartMeta) {
    return null;
  }

  const { chartType, chartData, chartMeta } = answer;
  const { xKey, yKeys } = chartMeta;

  if (chartData.length === 0) {
    return <div className="text-sm text-muted-foreground py-8 text-center italic">No data available for this query.</div>;
  }

  switch (chartType) {
    case "bar":
      return (
        <div className="h-[300px] w-full mt-6 mb-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis 
                dataKey={xKey} 
                stroke="hsl(var(--muted-foreground))" 
                fontSize={12} 
                tickLine={false} 
                axisLine={false}
                tickFormatter={(val) => String(val).length > 15 ? String(val).substring(0, 15) + '...' : String(val)}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))" 
                fontSize={12} 
                tickLine={false} 
                axisLine={false}
                tickFormatter={(val) => typeof val === 'number' && val > 1000 ? `${(val/1000).toFixed(1)}k` : val}
              />
              <Tooltip 
                cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--popover))', 
                  borderColor: 'hsl(var(--border))',
                  borderRadius: '6px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}
                itemStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              {yKeys.map((key, index) => (
                <Bar 
                  key={key} 
                  dataKey={key} 
                  fill={COLORS[index % COLORS.length]} 
                  radius={[4, 4, 0, 0]}
                  maxBarSize={50}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    
    case "pie":
      return (
        <div className="h-[300px] w-full mt-6 mb-2">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey={yKeys[0]}
                nameKey={xKey}
                stroke="hsl(var(--background))"
                strokeWidth={2}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--popover))', 
                  borderColor: 'hsl(var(--border))',
                  borderRadius: '6px'
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
      
    case "table":
      const columns = Object.keys(chartData[0] || {});
      return (
        <div className="w-full mt-6 mb-2 overflow-x-auto rounded-md border border-border/50 bg-card/30">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent bg-muted/20">
                {columns.map(col => (
                  <TableHead key={col} className="font-mono text-xs uppercase text-muted-foreground">{col}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {chartData.map((row, i) => (
                <TableRow key={i} className="border-border/50 hover:bg-muted/10">
                  {columns.map(col => (
                    <TableCell key={col} className="text-sm py-3">
                      {typeof row[col] === 'number' && row[col].toString().length > 3 
                        ? row[col].toLocaleString() 
                        : row[col]}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
      
    case "stat":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6 mb-4">
          {chartData.map((row, i) => (
            <div key={i} className="bg-card border border-border/50 rounded-xl p-5 flex flex-col justify-center">
              <div className="text-xs font-mono text-muted-foreground uppercase mb-2">{row[xKey]}</div>
              <div className="text-3xl font-light tracking-tight text-primary">
                {typeof row[yKeys[0]] === 'number' 
                  ? row[yKeys[0]].toLocaleString() 
                  : row[yKeys[0]]}
              </div>
            </div>
          ))}
        </div>
      );
      
    default:
      return null;
  }
}
