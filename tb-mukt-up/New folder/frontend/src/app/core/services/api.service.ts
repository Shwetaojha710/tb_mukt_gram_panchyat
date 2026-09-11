import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  get<T>(path: string, options?: object) {
    return this.http.get<T>(`${this.baseUrl}${path}`, options);
  }

  post<T>(path: string, body: unknown, options?: object) {
    return this.http.post<T>(`${this.baseUrl}${path}`, body, options);
  }
}
