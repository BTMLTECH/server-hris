import { NextFunction } from "express";
import Company, { ICompany } from "../models/Company";
import User, { IUser } from "../models/user.model";
import ErrorResponse from "../utils/ErrorResponse";
import { createActivationLink, validatePassword } from "../utils/passwordValidator";
import { AdminUserData, CompanyData, CreateCompanyDTO, EmailDTO, UserData } from "../types/auth";
import { TypedRequest } from "../types/typedRequest";
import { TypedResponse } from "../types/typedResponse";
import { accessToken, createActivationToken } from "./authController";
import { sendEmail } from "../utils/emailUtil";
import jwt, { Secret } from 'jsonwebtoken';
import { logAudit } from "../utils/logAudit";
import { asyncHandler } from "../middleware/asyncHandler";
import { redisClient } from "../utils/redisClient";


// Owner (Super Admin) creates Company + Admin
export const createCompanyWithAdmin = asyncHandler(
  async (req: TypedRequest<{}, {}, CreateCompanyDTO>, res: TypedResponse<AdminUserData>, next: NextFunction) => {
    const { companyName, companyDescription, adminData } = req.body;

    // Ensure company name and admin data are provided
    if (!companyName || !adminData) {
      return next(new ErrorResponse('Company name and admin data are required', 400));
    }

    // Check if the company already exists
    const existingCompany = await Company.findOne({ name: companyName });
    if (existingCompany) {
      return next(new ErrorResponse('Company already exists', 400));
    }

    // Check if the email already exists in the database
    const existingEmail = await User.findOne({ email: adminData.email.toLowerCase().trim() }) as IUser;
    if (existingEmail) {
      return next(new ErrorResponse('Email is already registered. Please use a different email address.', 400));
    }

    // Create the company
   const company = await Company.create({
      name: companyName,
      description: companyDescription || '',
      roles: 'admin',
      department: 'admin',
      status: 'active',
      branding: {
        displayName: companyName,
        logoUrl: '',
        primaryColor: '#030577ab',
      }
    });

    // Create the admin user linked to the company
    const adminUser = await User.create({
      firstName: adminData.firstName,
      lastName: adminData.lastName,
      middleName: adminData.middleName,
      email: adminData.email.toLowerCase().trim(),
      role: 'admin',
      department:"admin",
      company: company.id,      
      status:'active'
    });

    // Now, generate the activation token and activation link after the user is created
    // const {activationCode, token } = createActivationToken(adminUser);  // Passing the actual adminUser object
    const {activationCode, token } = accessToken(adminUser); 
    const activationLink = createActivationLink(token);

    // Decode the token to check for expiry and calculate time left
    const decoded = jwt.decode(token) as { exp: number };

    if (!decoded || !decoded.exp) {
      return next(new ErrorResponse('Invalid token or missing expiration', 500));
    }

    const expiryTimestamp = decoded.exp * 1000; // Convert from seconds to milliseconds
    const minutesLeft = Math.ceil((expiryTimestamp - Date.now()) / (60 * 1000));
     const  currentYear =  new Date().getFullYear();

        // 🔐 Save 2FA code and token in Redis
    // await redisClient.set(
    //   `2fa:${adminUser.email}`,
    //   JSON.stringify({ code: activationCode, token }),
    //   'EX',
    //   1800 // 30 minutes
    // );


    // Prepare email data
    const emailData = {
      name: adminUser.firstName,
      activationLink, // Include the activation link
      expiresAt: `in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`,
      defaultPassword: activationCode,
      companyName: company?.branding?.displayName || company?.name,
      logoUrl: company?.branding?.logoUrl ,
      primaryColor: company?.branding?.primaryColor || "#0621b6b0",
      currentYear
    };

    // Send the activation email
    const emailSent = await sendEmail(
      adminUser.email, 
      'Activate Your Account',
      'loginAdmin-link.ejs', 
      emailData
    );


    if (!emailSent) {
      return next(new ErrorResponse('Failed to send activation email', 500));
    }

    // Log the action
    await logAudit({
      userId: adminUser.id,
      action: 'ROLE_CREATED', 
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Map company and adminUser to match the CompanyData and UserData interfaces
    const companyObj: CompanyData = {
      id: company.id.toString(),
      name: company.name,
      description: company.description || '',
      roles: "admin",
      status: "active",
      department: company.department,
    };

    const adminUserObj: UserData = {
      id: adminUser.id.toString(),
      email: adminUser.email,
      role: adminUser.role,
      department: adminUser.department,
      token,
    };



    // Send the response with company and admin user data
    res.status(201).json({
      success: true,
      message: 'Company and admin created successfully. Activation email sent.',
      data: {
        company: companyObj,
        adminUser: adminUserObj,
      },
    });
  }
);

type FullyPopulatedUser = Omit<IUser, 'company' | 'user'> & { company: ICompany; user: IUser };


// export const createCompanyWithAdmin = asyncHandler(
//   async (
//     req: TypedRequest<{}, {}, CreateCompanyDTO>,
//     res: TypedResponse<AdminUserData>,
//     next: NextFunction
//   ) => {
//     const { companyName, companyDescription, adminData } = req.body;

//     if (!companyName || !adminData) {
//       return next(new ErrorResponse('Company name and admin data are required', 400));
//     }

//     const existingCompany = await Company.findOne({ name: companyName });
//     if (existingCompany) {
//       return next(new ErrorResponse('Company already exists', 400));
//     }

//     const existingEmail = await User.findOne({ email: adminData.email.toLowerCase().trim() }) as IUser;
//     if (existingEmail) {
//       return next(new ErrorResponse('Email is already registered. Please use a different email address.', 400));
//     }

//     // ✅ Create company
//     const company = await Company.create({
//       name: companyName,
//       description: companyDescription || '',
//       roles: 'admin',
//       department: 'admin',
//       status: 'active',
//       branding: {
//         displayName: companyName,
//         logoUrl: '',
//         primaryColor: '#030577ab',
//       }
//     });

//     // ✅ Create admin user
//     const adminUser = await User.create({
//       firstName: adminData.firstName,
//       lastName: adminData.lastName,
//       middleName: adminData.middleName,
//       email: adminData.email.toLowerCase().trim(),
//       role: 'admin',
//       department: 'admin',
//       company: company.id,
//       status: 'active'
//     });

//     // ✅ Generate token + activation
//     const { activationCode, token } = accessToken(adminUser);
//     const activationLink = createActivationLink(token);

//     const decoded = jwt.decode(token) as { exp: number };
//     if (!decoded || !decoded.exp) {
//       return next(new ErrorResponse('Invalid token or missing expiration', 500));
//     }

//     const expiryTimestamp = decoded.exp * 1000;
//     const minutesLeft = Math.ceil((expiryTimestamp - Date.now()) / (60 * 1000));

//     // ✅ Email data
//     const emailData = {
//       name: adminUser.firstName,
//       activationLink,
//       expiresAt: `in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`,
//       defaultPassword: activationCode,
//       companyName: company.branding?.displayName || company.name,
//       logoUrl: company.branding?.logoUrl || '',
//       primaryColor: company.branding?.primaryColor || '#0621b6b0',
//     };

//     const emailSent = await sendEmail(
//       adminUser.email,
//       'Activate Your FundMeCryptos Account',
//       'loginAdmin-link.ejs',
//       emailData
//     );

//     if (!emailSent) {
//       return next(new ErrorResponse('Failed to send activation email', 500));
//     }

//     await logAudit({
//       userId: adminUser.id,
//       action: 'ROLE_CREATED',
//       status: 'SUCCESS',
//       ip: req.ip,
//       userAgent: req.get('user-agent'),
//     });

//     // ✅ Shape response
//     const companyObj: CompanyData = {
//       id: company.id.toString(),
//       name: company.name,
//       description: company.description || '',
//       roles: company.roles,
//       department: company.department,
//       status: company.status,
//     };

//     const adminUserObj: UserData = {
//       id: adminUser.id.toString(),
//       email: adminUser.email,
//       role: adminUser.role,
//       department: adminUser.department,
//       token,
//     };

//     res.status(201).json({
//       success: true,
//       message: 'Company and admin created successfully. Activation email sent.',
//       data: {
//         company: companyObj,
//         adminUser: adminUserObj,
//       },
//     });
//   }
// );

// Function to handle resend of the activation link if expired
export const resendActivationLink = asyncHandler(
  async (req: TypedRequest<{}, {}, EmailDTO>, res: TypedResponse<{user: IUser}>, next: NextFunction) => {
    const { email } = req.body;  // Expecting email in the request body
    const company = req.company;

    // Ensure email is provided
    if (!email) {
      return next(new ErrorResponse('Email is required to resend activation link', 400));
    }

    // Find the user by email
    // const user = await User.findOne({ email: email.toLowerCase().trim() }).populate<{company: ICompany}>("company");
      const user = await User.findOne({ email: email.toLowerCase().trim() })
        .populate('company') as unknown as IUser & { company: ICompany };

    if (!user) {
      return next(new ErrorResponse('User not found', 404));
    }



    // Generate a new activation token
    // const { activationCode, token } = createActivationToken(user);
    const {activationCode, token } = accessToken(user); 


    // Decode the token to get the expiration time
    const decoded = jwt.decode(token) as { exp: number };
    if (!decoded || !decoded.exp) {
      return next(new ErrorResponse('Invalid token or missing expiration', 500));
    }

    // Calculate the expiration time in a human-readable format
    const expiryTimestamp = decoded.exp * 1000; // Convert from seconds to milliseconds
    const minutesLeft = Math.ceil((expiryTimestamp - Date.now()) / (60 * 1000));
    const expiresAt = `in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`;
   const  currentYear =  new Date().getFullYear();
    // await redisClient.set(
    //   `2fa:${user.email}`,
    //   JSON.stringify({ code: activationCode, token }),
    //   'EX',
    //   1800 // 30 minutes
    // );
    // Prepare email data
   const emailData = {
  name: user.firstName,
  activationLink: createActivationLink(token),
  expiresAt,
  defaultPassword: activationCode,

  companyName: user.company?.branding?.displayName || user.company?.name,
  logoUrl: user.company?.branding?.logoUrl,
  primaryColor: user.company?.branding?.primaryColor || "#0621b6b0",
  currentYear,
};

    // Send the activation email again
    const emailSent = await sendEmail(
      user.email,
      'Activate Your  Account',
      'loginAdmin-link.ejs',  // EJS template for the activation link
      emailData
    );

    if (!emailSent) {
      return next(new ErrorResponse('Failed to resend activation email', 500));
    }


    await User.findByIdAndUpdate(
           user._id,
           { sendInvite: true },
           { new: true } 
         );
        
    // Log the action
    await logAudit({
      userId: user.id,
      action: 'RESEND_ACTIVATION_LINK',
      status: 'SUCCESS',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    const updatedUser = await User.findByIdAndUpdate(
        user._id,
        { sendInvite: false },
        { new: true } 
      );
    if (!updatedUser) {
      return next(new ErrorResponse('Failed to retrieve updated user data', 500));
    }

    res.status(200).json({
      success: true,
      message: 'New activation email has been sent.',
      data: {
        user: updatedUser,
      },
    });
  }
);