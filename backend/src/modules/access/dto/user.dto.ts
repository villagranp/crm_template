import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export const USER_STATUSES = ['INVITED', 'ACTIVE', 'SUSPENDED', 'LOCKED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export class ListUsersQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @ApiPropertyOptional({ description: 'Busca en nombre y correo' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  search?: string;

  @ApiPropertyOptional({ enum: USER_STATUSES })
  @IsOptional()
  @IsEnum(USER_STATUSES)
  status?: UserStatus;

  @ApiPropertyOptional({ example: 'administrador' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  roleCode?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  teamId?: string;
}

export class CreateUserDto {
  @ApiProperty({ example: 'ana@example.com' })
  @IsEmail()
  @Length(5, 320)
  email!: string;

  @ApiProperty({ example: 'Ana' })
  @IsString()
  @Length(1, 80)
  firstName!: string;

  @ApiProperty({ example: 'Beltrán' })
  @IsString()
  @Length(1, 80)
  lastName!: string;

  @ApiPropertyOptional({ example: 'Administradora del sistema' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  jobTitle?: string;

  @ApiPropertyOptional({ example: '+52 55 1234 5678' })
  @IsOptional()
  @IsString()
  @Length(5, 40)
  phone?: string;

  @ApiProperty({ type: [String], format: 'uuid', description: 'Roles iniciales; al menos uno' })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleIds!: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  teamIds?: string[];
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  jobTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(5, 40)
  phone?: string;

  @ApiPropertyOptional({ enum: USER_STATUSES })
  @IsOptional()
  @IsEnum(USER_STATUSES)
  status?: UserStatus;
}

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty({ nullable: true })
  jobTitle!: string | null;

  @ApiProperty({ enum: USER_STATUSES })
  status!: UserStatus;

  @ApiProperty({ type: [String] })
  roles!: string[];

  @ApiProperty({ type: [Object] })
  teams!: { id: string; name: string; isPrimary: boolean }[];
}
