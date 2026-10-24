export type CafeVisitor={key:string;status:'diproses'|'sedang_dibuat'|'siap_disajikan'|'selesai';type:string;tableNumber:string|number|null;finishedAt:number|null};
export type CafeActivity={visitors?:CafeVisitor[];seating?:{tableNumber:string|number|null;count:number;type:string}[];active:number;queued:number;making:number;ready:number;dineInCount?:number;dineInReady:number;takeaway:number;posActive:boolean;mode?:'idle'|'cashier'|'working'|'deliver'|'waiting';dineIn?:boolean;tableNumber?:string|number|null};
export const EMPTY_CAFE_ACTIVITY:CafeActivity={active:0,queued:0,making:0,ready:0,dineInReady:0,takeaway:0,posActive:false,mode:'idle'};
export function activityMode(activity:CafeActivity){return activity.dineInReady>0?'deliver':activity.making>0?'working':activity.queued>0||activity.posActive?'cashier':activity.ready>0?'waiting':'idle';}

