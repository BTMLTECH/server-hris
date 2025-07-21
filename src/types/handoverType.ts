

export interface CreateHandoverDTO {    
    date: Date , 
    shift: 'day' | 'night',
    summary: string, 
    teamlead: string,
    employeename:string
}



    export interface MyHandoverReports {
    status?: string, from?: string, to?: string}